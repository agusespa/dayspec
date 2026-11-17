package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/agusespa/dayspec/internal/routine"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

const mcpInstructions = `Dayspec stores the user's routine templates, shared blocks and settings.
Read get_routine and get_schema before editing. Times are local HH:MM; durations are minutes. Template IDs and shared-block IDs are stable; change a block's name without changing its ID. A weekday can belong to only one template. Block activities have durations; set the start time on the block occurrence in the template.
Every write requires the revision from the latest read or successful write. If it conflicts, read again and reconcile your edit; never retry a stale whole-library overwrite. save_template and save_block replace only the named resource. update_routine replaces the entire library: anything omitted is deleted. save_settings replaces all settings. Preserve choice order, because choices can depend on earlier choices.
Per-date holiday and choice overrides live in the browser and are not available here. Saved changes appear in the app on its next refresh. Authentication is handled by Cloudflare Access, as with Gympass.`

func newMCPHandler(store *routine.Store) http.Handler {
	if store == nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { storageAvailable(w, nil) })
	}
	server := newMCPServer(store)
	return mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{
		Stateless: true, JSONResponse: true, MaxRequestBodyBytes: maxRequestBody,
		// Cloudflared may connect over loopback with the public hostname. Like
		// Gympass, the origin is private and authentication is at Cloudflare Access.
		DisableLocalhostProtection: true,
	})
}

type toolArguments struct {
	ID       string          `json:"id"`
	Revision string          `json:"revision"`
	Routine  json.RawMessage `json:"routine"`
	Template json.RawMessage `json:"template"`
	Block    json.RawMessage `json:"block"`
	Settings json.RawMessage `json:"settings"`
}

func newMCPServer(store *routine.Store) *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: "dayspec", Version: "1"}, &mcp.ServerOptions{Instructions: mcpInstructions})
	var schema map[string]any
	_ = json.Unmarshal(store.Schema(), &schema)
	defs := schema["$defs"]
	properties := schema["properties"].(map[string]any)
	library := map[string]any{}
	for key, value := range schema {
		if key != "$defs" && key != "$schema" && key != "$id" {
			library[key] = value
		}
	}
	revision := map[string]any{"type": "string", "minLength": 1, "description": "Exact revision returned by the latest read or write, including its quotation marks."}
	id := map[string]any{"$ref": "#/$defs/id", "description": "Stable resource ID. Use an existing ID to replace; a new ID creates the resource."}
	register := func(name, description string, props map[string]any, required []string, readOnly bool, run func(toolArguments) (any, error)) {
		input := map[string]any{"type": "object", "additionalProperties": false, "properties": props, "$defs": defs}
		if len(required) > 0 {
			input["required"] = required
		}
		// The validator accepts JSON-native arrays, so normalize schema metadata.
		encoded, err := json.Marshal(input)
		if err != nil {
			panic(err)
		}
		if err := json.Unmarshal(encoded, &input); err != nil {
			panic(err)
		}
		compiler := jsonschema.NewCompiler()
		url := "https://dayspec.local/mcp/" + name
		if err := compiler.AddResource(url, input); err != nil {
			panic(err)
		}
		validator, err := compiler.Compile(url)
		if err != nil {
			panic(err)
		}
		server.AddTool(&mcp.Tool{Name: name, Description: description, InputSchema: input, Annotations: &mcp.ToolAnnotations{ReadOnlyHint: readOnly, DestructiveHint: new(!readOnly), OpenWorldHint: new(false)}}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			fail := func(message string) (*mcp.CallToolResult, error) {
				return &mcp.CallToolResult{IsError: true, Content: []mcp.Content{&mcp.TextContent{Text: message}}}, nil
			}
			arguments := req.Params.Arguments
			if len(arguments) == 0 {
				arguments = json.RawMessage(`{}`)
			}
			var value any
			if err := json.Unmarshal(arguments, &value); err != nil {
				return fail("Send valid JSON arguments")
			}
			if err := validator.Validate(value); err != nil {
				return fail(err.Error())
			}
			// Decode the original bytes, not the validation map: nested choice order matters.
			var args toolArguments
			if err := json.Unmarshal(arguments, &args); err != nil {
				return fail("Invalid arguments")
			}
			out, err := run(args)
			if err != nil {
				_, message := publicError(err)
				return fail(message)
			}
			raw, err := json.Marshal(out)
			if err != nil {
				return nil, fmt.Errorf("encode tool result: %w", err)
			}
			return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: string(raw)}}, StructuredContent: json.RawMessage(raw)}, nil
		})
	}
	register("get_routine", "Read the complete template library, blocks, settings, and current revision.", map[string]any{}, nil, true, func(toolArguments) (any, error) { return store.Get(), nil })
	register("get_schema", "Read the authoritative JSON Schema for library edits.", map[string]any{}, nil, true, func(toolArguments) (any, error) { return store.Schema(), nil })
	register("update_routine", "Replace the entire library. Read first and include everything to keep; omitted templates, blocks and settings are deleted.", map[string]any{"routine": library, "revision": revision}, []string{"routine", "revision"}, false, func(a toolArguments) (any, error) { return store.Save(a.Routine, a.Revision) })
	for _, resource := range []struct {
		name, section string
		shape         any
	}{{"template", "days", map[string]any{"$ref": "#/$defs/day"}}, {"block", "blocks", properties["blocks"].(map[string]any)["additionalProperties"]}} {
		register("save_"+resource.name, "Create or replace one "+resource.name+" by stable ID, preserving the rest of the library. Send its complete contents; omitted fields are removed.", map[string]any{"id": id, "revision": revision, resource.name: resource.shape}, []string{"id", "revision", resource.name}, false, func(a toolArguments) (any, error) {
			value := a.Template
			if resource.name == "block" {
				value = a.Block
			}
			return store.ChangeResource(resource.section, a.ID, value, a.Revision, false)
		})
		register("delete_"+resource.name, "Delete one "+resource.name+". Referenced blocks cannot be deleted; deleting a holiday template clears its holiday setting.", map[string]any{"id": id, "revision": revision}, []string{"id", "revision"}, false, func(a toolArguments) (any, error) {
			return store.ChangeResource(resource.section, a.ID, nil, a.Revision, true)
		})
	}
	register("save_settings", "Replace all settings while preserving templates and blocks. Read the current settings first.", map[string]any{"settings": properties["settings"], "revision": revision}, []string{"settings", "revision"}, false, func(a toolArguments) (any, error) {
		return store.ChangeResource("settings", "", a.Settings, a.Revision, false)
	})
	return server
}
