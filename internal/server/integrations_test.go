package server

import (
	"context"
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
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func integrationServer(t *testing.T) (*routine.Store, *httptest.Server) {
	t.Helper()
	schema, err := os.ReadFile("../../routine.schema.json")
	if err != nil {
		t.Fatal(err)
	}
	store, err := routine.Open(filepath.Join(t.TempDir(), "routine.json"), []byte(`{"templates":{"work":{"on":["mon"],"items":[{"title":"Work","time":"08:00","duration":60}]}}}`), schema)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(New(fstest.MapFS{"index.html": {Data: []byte("app")}}, store))
	t.Cleanup(srv.Close)
	return store, srv
}
func apiRequest(t *testing.T, server, method, path, body, revision string) (int, []byte, string) {
	t.Helper()
	req, err := http.NewRequest(method, server+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if revision != "" {
		req.Header.Set("If-Match", revision)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	var raw json.RawMessage
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		t.Fatal(err)
	}
	return res.StatusCode, raw, res.Header.Get("ETag")
}
func TestIntegrationHTTPFlow(t *testing.T) {
	store, srv := integrationServer(t)
	for _, path := range []string{"/api/templates", "/api/templates/work", "/api/blocks", "/api/settings", "/api/schema", "/api/openapi.json"} {
		code, raw, revision := apiRequest(t, srv.URL, "GET", path, "", "")
		if code != 200 || !json.Valid(raw) {
			t.Fatal(path, code, string(raw))
		}
		if path != "/api/schema" && path != "/api/openapi.json" && revision != store.Get().Revision {
			t.Fatal("missing matching ETag")
		}
	}
	revision := store.Get().Revision
	code, raw, _ := apiRequest(t, srv.URL, "PUT", "/api/blocks/stable", `{"block":{"name":"Wake Up!","items":[{"title":"Wake","duration":5}]}}`, revision)
	if code != 200 {
		t.Fatal(code, string(raw))
	}
	var saved routine.Snapshot
	_ = json.Unmarshal(raw, &saved)
	if _, raw, _ := apiRequest(t, srv.URL, "GET", "/api/templates/work", "", ""); !strings.Contains(string(raw), "Work") {
		t.Fatal("block edit erased template")
	}
	code, raw, _ = apiRequest(t, srv.URL, "PUT", "/api/templates/work", `{"template":{"on":["mon"],"items":[{"use":"stable","time":"07:00"}]}}`, saved.Revision)
	if code != 200 {
		t.Fatal(code, string(raw))
	}
	_ = json.Unmarshal(raw, &saved)
	before := store.Get()
	code, _, _ = apiRequest(t, srv.URL, "DELETE", "/api/blocks/stable", "", saved.Revision)
	if code != 422 || store.Get().Revision != before.Revision {
		t.Fatal("referenced block delete accepted")
	}
	code, raw, _ = apiRequest(t, srv.URL, "PUT", "/api/settings", `{"settings":{"holiday_template":"work"}}`, saved.Revision)
	if code != 200 {
		t.Fatal(code, string(raw))
	}
	_ = json.Unmarshal(raw, &saved)
	code, raw, _ = apiRequest(t, srv.URL, "DELETE", "/api/templates/work", "", saved.Revision)
	if code != 200 {
		t.Fatal(code, string(raw))
	}
	_ = json.Unmarshal(raw, &saved)
	if strings.Contains(string(saved.Routine), `"holiday_template"`) {
		t.Fatal("dangling holiday setting")
	}
	code, _, _ = apiRequest(t, srv.URL, "DELETE", "/api/blocks/stable", "", saved.Revision)
	if code != 200 {
		t.Fatal(code)
	}
}
func TestIntegrationHTTPRejections(t *testing.T) {
	store, srv := integrationServer(t)
	revision := store.Get().Revision
	cases := []struct {
		method, path, body, revision string
		status                       int
	}{
		{"PUT", "/api/settings", `{"settings":{}}`, "", 428},
		{"PUT", "/api/settings", `{"settings":{}}`, "stale", 412},
		{"PUT", "/api/settings", `{`, revision, 400},
		{"PUT", "/api/settings", `{"settings":{}} {}`, revision, 400},
		{"PUT", "/api/settings", `{"settings":{},"extra":true}`, revision, 400},
		{"PUT", "/api/settings", `{"settings":null}`, revision, 422},
		{"PUT", "/api/templates/new", `{"template":{"on":["mon"],"items":[]}}`, revision, 422},
		{"PUT", "/api/blocks/new", `{"block":{"name":"Bad","items":[{"title":"No duration"}]}}`, revision, 422},
		{"PUT", "/api/blocks/bad!", `{"block":{}}`, revision, 400},
		{"GET", "/api/blocks/missing", "", "", 404},
		{"DELETE", "/api/blocks/missing", "", revision, 404},
		{"DELETE", "/api/templates/work", "", "", 428},
		{"PUT", "/api/settings", `{"settings":{"x":"` + strings.Repeat("x", 1<<20) + `"}}`, revision, 413},
	}
	for _, tc := range cases {
		t.Run(fmt.Sprintf("%s %s %d", tc.method, tc.path, tc.status), func(t *testing.T) {
			code, raw, _ := apiRequest(t, srv.URL, tc.method, tc.path, tc.body, tc.revision)
			if code != tc.status {
				t.Fatalf("got %d want %d: %s", code, tc.status, raw)
			}
			if store.Get().Revision != revision {
				t.Fatal("rejected write changed data")
			}
		})
	}
}

// Match Gympass: cloudflared connects with the public hostname, not localhost.
type accessTunnelTransport struct{}

func (accessTunnelTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	r.Host = "dayspec.example.com"
	return http.DefaultTransport.RoundTrip(r)
}
func connectMCP(t *testing.T, url string) *mcp.ClientSession {
	t.Helper()
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "1"}, nil)
	session, err := client.Connect(context.Background(), &mcp.StreamableClientTransport{Endpoint: url + "/mcp", HTTPClient: &http.Client{Transport: accessTunnelTransport{}}, MaxRetries: -1}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = session.Close() })
	return session
}
func callTool(t *testing.T, session *mcp.ClientSession, name string, args any) (*mcp.CallToolResult, routine.Snapshot) {
	t.Helper()
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatal(err)
	}
	var snapshot routine.Snapshot
	if !result.IsError {
		raw, _ := json.Marshal(result.StructuredContent)
		_ = json.Unmarshal(raw, &snapshot)
	}
	return result, snapshot
}
func TestMCPIntegrationFlow(t *testing.T) {
	store, srv := integrationServer(t)
	session := connectMCP(t, srv.URL)
	tools, err := session.ListTools(context.Background(), nil)
	if err != nil || len(tools.Tools) != 8 {
		t.Fatal(tools, err)
	}
	for _, tool := range tools.Tools {
		if tool.InputSchema == nil || tool.Annotations == nil {
			t.Fatal("missing tool contract")
		}
	}
	result, current := callTool(t, session, "get_routine", map[string]any{})
	if result.IsError || current.Revision != store.Get().Revision {
		t.Fatal(result)
	}
	result, _ = callTool(t, session, "get_schema", map[string]any{})
	if result.IsError {
		t.Fatal(result)
	}
	result, current = callTool(t, session, "save_block", map[string]any{"id": "stable", "revision": current.Revision, "block": map[string]any{"name": "Wake Up!", "items": []any{map[string]any{"title": "Wake", "duration": 5}}}})
	if result.IsError {
		t.Fatal(result)
	}
	result, current = callTool(t, session, "save_template", map[string]any{"id": "work", "revision": current.Revision, "template": map[string]any{"on": []string{"mon"}, "items": []any{map[string]any{"use": "stable", "time": "07:00"}}}})
	if result.IsError {
		t.Fatal(result)
	}
	before := store.Get()
	for _, tc := range []struct {
		name string
		args any
	}{
		{"save_block", map[string]any{"id": "stable", "revision": "stale", "block": map[string]any{"name": "Changed", "items": []any{map[string]any{"title": "Wake", "duration": 5}}}}},
		{"save_template", map[string]any{"id": "work", "template": map[string]any{"on": []string{"mon"}, "items": []any{}}}},
		{"delete_block", map[string]any{"id": "stable", "revision": before.Revision}},
		{"save_settings", map[string]any{"settings": map[string]any{"holiday_template": "missing"}, "revision": before.Revision}},
		{"save_block", map[string]any{"id": "bad", "revision": before.Revision, "block": map[string]any{"name": "Bad", "items": []any{map[string]any{"title": "No duration"}}}}},
		{"get_routine", map[string]any{"unknown": true}},
	} {
		result, _ := callTool(t, session, tc.name, tc.args)
		if !result.IsError {
			t.Fatal("expected actionable tool error", tc.name)
		}
		if store.Get().Revision != before.Revision {
			t.Fatal("rejected tool changed routine")
		}
	}
	result, current = callTool(t, session, "save_settings", map[string]any{"settings": map[string]any{"holiday_template": "work"}, "revision": current.Revision})
	if result.IsError {
		t.Fatal(result)
	}
	result, current = callTool(t, session, "delete_template", map[string]any{"id": "work", "revision": current.Revision})
	if result.IsError {
		t.Fatal(result)
	}
	result, current = callTool(t, session, "delete_block", map[string]any{"id": "stable", "revision": current.Revision})
	if result.IsError {
		t.Fatal(result)
	}
	result, _ = callTool(t, session, "update_routine", map[string]any{"routine": json.RawMessage(`{"templates":{}}`), "revision": current.Revision})
	if result.IsError {
		t.Fatal(result)
	}
	if strings.Contains(string(store.Get().Routine), "stable") {
		t.Fatal("delete did not persist")
	}
}
func TestIntegrationCrossOriginAndUnavailable(t *testing.T) {
	store, _ := integrationServer(t)
	handler := New(fstest.MapFS{}, store)
	for _, path := range []string{"/mcp", "/api/templates/work", "/api/blocks/new", "/api/settings"} {
		method := "PUT"
		if path == "/mcp" {
			method = "POST"
		}
		req := httptest.NewRequest(method, "http://dayspec.example.com"+path, strings.NewReader(`{}`))
		req.Header.Set("Origin", "https://evil.example")
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != 403 {
			t.Fatal(path, res.Code)
		}
	}
	handler = New(fstest.MapFS{}, nil)
	for _, path := range []string{"/mcp", "/api/schema", "/api/templates", "/api/settings", "/api/openapi.json"} {
		if res := get(t, handler, "GET", path); res.Code != 503 {
			t.Fatal(path, res.Code)
		}
	}
}
func TestOpenAPISchemaReferences(t *testing.T) {
	store, _ := integrationServer(t)
	doc := openAPIDocument(store.Schema())
	if doc["openapi"] != "3.1.0" || doc["security"] == nil {
		t.Fatal("missing OpenAPI or Access credentials")
	}
	var walk func(any)
	walk = func(value any) {
		switch value := value.(type) {
		case map[string]any:
			for key, child := range value {
				if key == "$ref" {
					ref := child.(string)
					if !strings.HasPrefix(ref, "#/components/schemas/") {
						t.Fatal(ref)
					}
					name := strings.TrimPrefix(ref, "#/components/schemas/")
					if doc["components"].(map[string]any)["schemas"].(map[string]any)[name] == nil {
						t.Fatal("dangling reference", ref)
					}
				}
				walk(child)
			}
		case []any:
			for _, child := range value {
				walk(child)
			}
		}
	}
	walk(doc)
}

func TestIntegrationErrorsHideStoragePaths(t *testing.T) {
	status, message := publicError(fmt.Errorf("persist templates: /private/internal/routine.json: permission denied"))
	if status != 500 || strings.Contains(message, "/private/") || strings.Contains(message, "permission denied") {
		t.Fatal(status, message)
	}
}
