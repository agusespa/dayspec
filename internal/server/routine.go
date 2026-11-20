package server

import (
	"encoding/json"
	"net/http"

	"github.com/agusespa/dayspec/internal/routine"
)

func routineRoutes(mux *http.ServeMux, store *routine.Store) {
	mux.HandleFunc("GET /api/routine", func(w http.ResponseWriter, r *http.Request) {
		if !storageAvailable(w, store) {
			return
		}
		current := store.Get()
		w.Header().Set("ETag", current.Revision)
		writeJSON(w, http.StatusOK, current)
	})
	mux.HandleFunc("PUT /api/routine", func(w http.ResponseWriter, r *http.Request) {
		if !storageAvailable(w, store) {
			return
		}
		if r.Header.Get("If-Match") == "" {
			resourceError(w, routine.ErrRevisionRequired)
			return
		}
		var body struct {
			Routine json.RawMessage `json:"routine"`
		}
		if !decodeRequest(w, r, &body) {
			return
		}
		saved, err := store.Save(body.Routine, r.Header.Get("If-Match"))
		if err != nil {
			resourceError(w, err)
			return
		}
		w.Header().Set("ETag", saved.Revision)
		writeJSON(w, http.StatusOK, saved)
	})
}
