package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/agusespa/dayspec/internal/routine"
)

func TestRoutineAPI(t *testing.T) {
	const initial = `{"templates":{"saturday":{"on":["mon","tue","wed","thu","fri","sat","sun"],"items":[{"title":"Wake","duration":5,"time":"08:00"}]}},"settings":{"holiday_template":"saturday"}}`
	schema, err := os.ReadFile("../../routine.schema.json")
	if err != nil {
		t.Fatal(err)
	}
	store, err := routine.Open(filepath.Join(t.TempDir(), "routine.json"), []byte(initial), schema)
	if err != nil {
		t.Fatal(err)
	}
	handler := New(fstest.MapFS{"index.html": {Data: []byte("app")}}, store)
	rec := get(t, handler, http.MethodGet, "/api/routine")
	if rec.Code != 200 || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(rec)
	}
	var current routine.Snapshot
	if err := json.Unmarshal(rec.Body.Bytes(), &current); err != nil {
		t.Fatal(err)
	}
	if current.Revision != rec.Header().Get("ETag") {
		t.Fatal("ETag mismatch")
	}
	payload := `{"routine":` + strings.Replace(initial, "Wake", "Read", 1) + `}`
	request := func(body, revision, content, origin string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodPut, "http://dayspec.local/api/routine", strings.NewReader(body))
		req.Header.Set("If-Match", revision)
		req.Header.Set("Content-Type", content)
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		return res
	}
	for _, tc := range []struct {
		name, body, revision, content, origin string
		code                                  int
	}{
		{"requires revision", payload, "", "application/json", "", 428},
		{"rejects cross-origin", payload, current.Revision, "application/json", "https://evil.example", 403},
		{"requires JSON", payload, current.Revision, "text/plain", "", 415},
		{"bad JSON", `{`, current.Revision, "application/json", "", 400},
		{"trailing JSON", payload + `{}`, current.Revision, "application/json", "", 400},
		{"missing routine", `{}`, current.Revision, "application/json", "", 422},
		{"unknown field", `{"routine":{},"extra":true}`, current.Revision, "application/json", "", 400},
		{"invalid reference", `{"routine":{"templates":{},"settings":{"holiday_template":"missing"}}}`, current.Revision, "application/json", "", 422},
		{"invalid routine", `{"routine":{}}`, current.Revision, "application/json", "", 422},
		{"too large", `{"routine":"` + strings.Repeat("a", 1<<20) + `"}`, current.Revision, "application/json", "", 413},
		{"same-origin behind tunnel", payload, current.Revision, "application/json", "https://dayspec.local", 200},
		{"stale revision", `{"routine":` + initial + `}`, current.Revision, "application/json", "", 412},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := request(tc.body, tc.revision, tc.content, tc.origin)
			if res.Code != tc.code {
				t.Fatalf("%d, want %d: %s", res.Code, tc.code, res.Body.String())
			}
		})
	}
	if !strings.Contains(string(store.Get().Routine), "Read") {
		t.Fatal("successful update missing")
	}
	// Safe reads remain available cross-origin; writes with Fetch Metadata are blocked.
	req := httptest.NewRequest(http.MethodPut, "/api/routine", strings.NewReader(payload))
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != 403 {
		t.Fatal(fmt.Sprint("cross-site write: ", res.Code))
	}
}
