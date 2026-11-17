package server

import (
	"bytes"
	"encoding/json"
)

// OpenAPI uses the stored schema as-is rather than maintaining another model.
func openAPIDocument(raw json.RawMessage) map[string]any {
	var schema map[string]any
	_ = json.Unmarshal(raw, &schema)
	root := map[string]any{}
	for key, value := range schema {
		if key != "$id" && key != "$schema" && key != "$defs" {
			root[key] = value
		}
	}
	paths := map[string]any{}
	response := func(description string) map[string]any { return map[string]any{"description": description} }
	get := func(description string) map[string]any {
		return map[string]any{"summary": description, "responses": map[string]any{"200": response("JSON resource plus revision; ETag contains the same revision"), "404": response("Unknown resource")}}
	}
	write := func(description, key string, shape any) map[string]any {
		return map[string]any{"summary": description, "parameters": []any{map[string]any{"name": "If-Match", "in": "header", "required": true, "schema": map[string]any{"type": "string"}, "description": "Use the exact ETag/revision from the latest read or write"}}, "requestBody": map[string]any{"required": true, "content": map[string]any{"application/json": map[string]any{"schema": map[string]any{"type": "object", "required": []string{key}, "additionalProperties": false, "properties": map[string]any{key: shape}}}}}, "responses": map[string]any{"200": response("Saved routine and new revision"), "400": response("Invalid request"), "412": response("Revision conflict; read again and reconcile"), "413": response("Request exceeds 1 MB"), "415": response("Send application/json"), "422": response("Invalid data or references; nothing changed"), "428": response("Missing If-Match")}}
	}
	paths["/api/routine"] = map[string]any{"get": get("Read the complete library"), "put": write("Replace the complete library; omitted data is deleted", "routine", root)}
	props := schema["properties"].(map[string]any)
	for _, resource := range []struct {
		path, key string
		shape     any
	}{{"templates", "template", map[string]any{"$ref": "#/$defs/day"}}, {"blocks", "block", props["blocks"].(map[string]any)["additionalProperties"]}, {"settings", "settings", props["settings"]}} {
		base := "/api/" + resource.path
		if resource.path == "settings" {
			paths[base] = map[string]any{"get": get("Read settings"), "put": write("Replace all settings", resource.key, resource.shape)}
			continue
		}
		paths[base] = map[string]any{"get": get("List " + resource.path)}
		deletion := write("Delete "+resource.key, "unused", nil)
		delete(deletion, "requestBody")
		paths[base+"/{id}"] = map[string]any{"parameters": []any{map[string]any{"name": "id", "in": "path", "required": true, "schema": map[string]any{"$ref": "#/$defs/id"}}}, "get": get("Read " + resource.key), "put": write("Create or replace "+resource.key, resource.key, resource.shape), "delete": deletion}
	}
	paths["/api/schema"] = map[string]any{"get": get("Read the complete library JSON Schema")}
	document := map[string]any{"openapi": "3.1.0", "info": map[string]any{"title": "Dayspec HTTP API", "version": "1", "description": "Authenticated by Cloudflare Access, like Gympass. All integrations, including n8n and AI clients, use the existing Cloudflare-protected public hostname and Access service credentials. No separate application token. All writes require If-Match; returned revisions are global to the library. Per-date browser overrides are not stored here."}, "servers": []any{map[string]any{"url": "/"}}, "paths": paths, "components": map[string]any{"schemas": schema["$defs"], "securitySchemes": map[string]any{"accessClientID": map[string]any{"type": "apiKey", "in": "header", "name": "CF-Access-Client-Id"}, "accessClientSecret": map[string]any{"type": "apiKey", "in": "header", "name": "CF-Access-Client-Secret"}}}, "security": []any{map[string]any{"accessClientID": []string{}, "accessClientSecret": []string{}}}}
	rawDocument, _ := json.Marshal(document)
	rawDocument = bytes.ReplaceAll(rawDocument, []byte("#/$defs/"), []byte("#/components/schemas/"))
	var result map[string]any
	_ = json.Unmarshal(rawDocument, &result)
	return result

}
