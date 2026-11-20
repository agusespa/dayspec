package server

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"

	"github.com/agusespa/dayspec/internal/routine"
)

const maxRequestBody = 1 << 20

// Authentication is supplied by Cloudflare Access.
// Production has no published host port; these routes share the existing origin.
func resourceRoutes(mux *http.ServeMux, store *routine.Store) {
	mux.HandleFunc("GET /api/schema", func(w http.ResponseWriter, r *http.Request) {
		if !storageAvailable(w, store) {
			return
		}
		writeJSON(w, 200, store.Schema())
	})
	mux.HandleFunc("GET /api/openapi.json", func(w http.ResponseWriter, r *http.Request) {
		if !storageAvailable(w, store) {
			return
		}
		writeJSON(w, 200, openAPIDocument(store.Schema()))
	})
	for _, resource := range []struct{ section, singular string }{{"templates", "template"}, {"blocks", "block"}, {"settings", "settings"}} {
		base := "/api/" + resource.section
		read := func(w http.ResponseWriter, r *http.Request) {
			if !storageAvailable(w, store) {
				return
			}
			id := r.PathValue("id")
			value, revision, err := store.ReadResource(resource.section, id)
			if err != nil {
				resourceError(w, err)
				return
			}
			key := resource.singular
			if id == "" {
				key = resource.section
			}
			w.Header().Set("ETag", revision)
			writeJSON(w, 200, map[string]any{key: value, "revision": revision})
		}
		mux.HandleFunc("GET "+base, read)
		target := base
		if resource.section != "settings" {
			target += "/{id}"
			mux.HandleFunc("GET "+target, read)
		}
		mux.HandleFunc("PUT "+target, func(w http.ResponseWriter, r *http.Request) {
			if !storageAvailable(w, store) {
				return
			}
			if r.Header.Get("If-Match") == "" {
				resourceError(w, routine.ErrRevisionRequired)
				return
			}
			var body map[string]json.RawMessage
			if !decodeRequest(w, r, &body) {
				return
			}
			if len(body) != 1 || len(body[resource.singular]) == 0 {
				writeJSON(w, 400, map[string]string{"error": "send an object containing only " + resource.singular})
				return
			}
			saved, err := store.ChangeResource(resource.section, r.PathValue("id"), body[resource.singular], r.Header.Get("If-Match"), false)
			if err != nil {
				resourceError(w, err)
				return
			}
			w.Header().Set("ETag", saved.Revision)
			writeJSON(w, 200, saved)
		})
		if resource.section != "settings" {
			mux.HandleFunc("DELETE "+target, func(w http.ResponseWriter, r *http.Request) {
				if !storageAvailable(w, store) {
					return
				}
				saved, err := store.ChangeResource(resource.section, r.PathValue("id"), nil, r.Header.Get("If-Match"), true)
				if err != nil {
					resourceError(w, err)
					return
				}
				w.Header().Set("ETag", saved.Revision)
				writeJSON(w, 200, saved)
			})
		}
	}
}
func storageAvailable(w http.ResponseWriter, store *routine.Store) bool {
	if store != nil {
		return true
	}
	writeJSON(w, 503, map[string]string{"error": "Template storage is unavailable"})
	return false
}
func decodeRequest(w http.ResponseWriter, r *http.Request, target any) bool {
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaType != "application/json" {
		writeJSON(w, 415, map[string]string{"error": "Send JSON"})
		return false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBody))
	decoder.DisallowUnknownFields()
	err := decoder.Decode(target)
	if err == nil {
		err = decoder.Decode(new(any))
		if errors.Is(err, io.EOF) {
			return true
		}
		if err == nil {
			err = errors.New("send one JSON object")
		}
	}
	status := 400
	var oversized *http.MaxBytesError
	if errors.As(err, &oversized) {
		status = 413
	}
	writeJSON(w, status, map[string]string{"error": "Invalid JSON request"})
	return false
}
func resourceError(w http.ResponseWriter, err error) {
	status, message := publicError(err)
	writeJSON(w, status, map[string]string{"error": message})
}
func publicError(err error) (int, string) {
	var invalid *routine.ValidationError
	switch {
	case errors.Is(err, routine.ErrRevisionRequired):
		return 428, err.Error()
	case errors.Is(err, routine.ErrConflict):
		return 412, err.Error()
	case errors.Is(err, routine.ErrNotFound):
		return 404, err.Error()
	case errors.Is(err, routine.ErrInvalidResource):
		return 400, err.Error()
	case errors.As(err, &invalid):
		return 422, err.Error()
	default:
		log.Printf("routine integration: %v", err)
		return 500, "Could not save the routine. Read the latest revision and try again."
	}
}
