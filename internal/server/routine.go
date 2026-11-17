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

func routineRoutes(mux *http.ServeMux, store *routine.Store) {
	mux.HandleFunc("GET /api/routine", func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "Template storage is unavailable"})
			return
		}
		current := store.Get()
		w.Header().Set("ETag", current.Revision)
		writeJSON(w, http.StatusOK, current)
	})
	mux.HandleFunc("PUT /api/routine", func(w http.ResponseWriter, r *http.Request) {
		fail := func(code int, message string) { writeJSON(w, code, map[string]string{"error": message}) }
		if store == nil {
			fail(http.StatusServiceUnavailable, "Template storage is unavailable")
			return
		}
		if r.Header.Get("If-Match") == "" {
			fail(http.StatusPreconditionRequired, "Reload templates before saving")
			return
		}
		mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if mediaType != "application/json" {
			fail(http.StatusUnsupportedMediaType, "Send templates as JSON")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		var body struct {
			Routine json.RawMessage `json:"routine"`
		}
		if err := decoder.Decode(&body); err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				fail(http.StatusRequestEntityTooLarge, "Templates exceed 1 MB")
			} else {
				fail(http.StatusBadRequest, "Invalid template request")
			}
			return
		}
		if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
			fail(http.StatusBadRequest, "Send one JSON object")
			return
		}
		if err := store.Validate(body.Routine); err != nil {
			fail(http.StatusUnprocessableEntity, err.Error())
			return
		}
		saved, err := store.Save(body.Routine, r.Header.Get("If-Match"))
		if errors.Is(err, routine.ErrConflict) {
			fail(http.StatusPreconditionFailed, err.Error())
			return
		}
		if err != nil {
			log.Printf("save templates: %v", err)
			fail(http.StatusInternalServerError, "Could not save templates. Your draft is still open; try again.")
			return
		}
		w.Header().Set("ETag", saved.Revision)
		writeJSON(w, http.StatusOK, saved)
	})
}
