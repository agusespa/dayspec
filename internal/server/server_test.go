package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func get(t *testing.T, h http.Handler, method, target string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, target, nil))
	return rec
}

func TestProbes(t *testing.T) {
	check := func(h http.Handler, path string, code int, status string) {
		t.Helper()
		rec := get(t, h, http.MethodGet, path)
		if rec.Code != code {
			t.Fatalf("%s returned %d: %s", path, rec.Code, rec.Body.String())
		}
		if rec.Header().Get("Content-Type") != "application/json" || rec.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("unexpected probe headers: %v", rec.Header())
		}
		var body map[string]string
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body["status"] != status {
			t.Fatalf("unexpected probe body: %s (%v)", rec.Body.String(), err)
		}
	}

	built := New(fstest.MapFS{"index.html": {Data: []byte("<html></html>")}}, nil)
	check(built, "/api/healthz", http.StatusOK, "ok")
	check(built, "/api/readyz", http.StatusOK, "ready")

	empty := New(fstest.MapFS{}, nil)
	check(empty, "/api/healthz", http.StatusOK, "ok")
	check(empty, "/api/readyz", http.StatusServiceUnavailable, "not_ready")
}

func TestStatic(t *testing.T) {
	h := New(fstest.MapFS{
		"index.html":                 {Data: []byte("<html>app</html>")},
		"service-worker.js":          {Data: []byte("// sw")},
		"_app/immutable/entry/a.js":  {Data: []byte("// a")},
		"manifest.webmanifest":       {Data: []byte("{}")},
		"_app/immutable/nodes/0.css": {Data: []byte("")},
	}, nil)

	for _, tc := range []struct {
		path, cache, body string
	}{
		{"/", "no-cache", "<html>app</html>"},
		{"/some/route", "no-cache", "<html>app</html>"},
		{"/service-worker.js", "no-cache", "// sw"},
		{"/_app/immutable/entry/a.js", "public, max-age=31536000, immutable", "// a"},
	} {
		rec := get(t, h, http.MethodGet, tc.path)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s returned %d", tc.path, rec.Code)
		}
		if got := rec.Header().Get("Cache-Control"); got != tc.cache {
			t.Errorf("%s Cache-Control = %q, want %q", tc.path, got, tc.cache)
		}
		if rec.Body.String() != tc.body {
			t.Errorf("%s body = %q, want %q", tc.path, rec.Body.String(), tc.body)
		}
	}

	if rec := get(t, h, http.MethodGet, "/api/unknown"); rec.Code != http.StatusNotFound {
		t.Errorf("/api/unknown returned %d, want 404", rec.Code)
	}
	if rec := get(t, h, http.MethodPost, "/"); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST / returned %d, want 405", rec.Code)
	}
}

func TestStaticWithoutBuild(t *testing.T) {
	if rec := get(t, New(fstest.MapFS{}, nil), http.MethodGet, "/"); rec.Code != http.StatusNotFound {
		t.Fatalf("unbuilt frontend returned %d, want 404", rec.Code)
	}
}
