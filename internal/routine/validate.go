package routine

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/url"
	"slices"
	"strings"
)

var weekdays = []string{"mon", "tue", "wed", "thu", "fri", "sat", "sun"}

func object(v any) map[string]any    { m, _ := v.(map[string]any); return m }
func list(v any) []any               { a, _ := v.([]any); return a }
func str(v any) string               { s, _ := v.(string); return s }
func has(values any, value any) bool { return slices.Contains(list(values), value) }

// Schema validation runs first, so this only checks relationships between valid shapes.
func checkReferences(root map[string]any, raw []byte) error {
	days, blocks, categories := object(root["days"]), object(root["blocks"]), object(root["categories"])
	var problems []string
	add := func(where, message string) { problems = append(problems, where+": "+message) }
	for _, wd := range weekdays {
		owners := 0
		for _, d := range days {
			if has(object(d)["on"], wd) {
				owners++
			}
		}
		if owners > 1 {
			add("days", "more than one template covers "+wd)
		}
	}
	holiday := str(object(root["settings"])["holiday"])
	if str(object(root["settings"])["holiday"]) != "" && days[holiday] == nil {
		add("settings.holiday", "unknown template "+holiday)
	}
	checkWhen := func(when any, choices map[string]any, where string) {
		for key, cond := range object(when) {
			if key == "days" {
				continue
			}
			choice := object(choices[key])
			if choice == nil {
				add(where, "unknown or later choice "+key)
				continue
			}
			if choice["type"] == "toggle" {
				if _, ok := cond.(bool); !ok {
					add(where+"."+key, "a toggle needs true or false")
				}
				continue
			}
			if _, ok := cond.(bool); ok {
				add(where+"."+key, "this choice is not a toggle")
				continue
			}
			if neg := object(cond); neg != nil {
				cond = neg["not"]
			}
			values := list(cond)
			if values == nil {
				values = []any{cond}
			}
			for _, value := range values {
				if object(choice["options"])[str(value)] == nil {
					add(where+"."+key, "unknown option "+str(value))
				}
			}
		}
	}
	checkLinks := func(item map[string]any, where string) {
		if item["link"] == nil {
			return
		}
		refs := list(item["link"])
		if refs == nil {
			refs = []any{item["link"]}
		}
		for _, ref := range refs {
			name := str(ref)
			parsed, err := url.Parse(name)
			if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Hostname() == "" {
				add(where, "invalid link URL")
			}
		}
	}
	remaining := 10_000
	var walk func([]any, map[string]any, string, []string, int)
	walk = func(entries []any, choices map[string]any, where string, stack []string, depth int) {
		if depth > 64 && len(entries) > 0 {
			add(where, "nesting or block expansion exceeds 64 levels")
			return
		}
		for i, value := range entries {
			if remaining <= 0 {
				if remaining == 0 {
					add("routine", "expanded routine exceeds 10000 entries")
					remaining--
				}
				return
			}
			remaining--
			e := object(value)
			at := fmt.Sprintf("%s[%d]", where, i)
			if nested := list(e["items"]); nested != nil {
				checkWhen(e["when"], choices, at+".when")
				walk(nested, choices, at+".items", stack, depth+1)
				continue
			}
			if name := str(e["use"]); name != "" {
				block, ok := blocks[name]
				if !ok {
					add(at, "unknown block "+name)
					continue
				}
				if slices.Contains(stack, name) {
					add(at, "circular block reference "+name)
					continue
				}
				next := append(slices.Clone(stack), name)
				walk(list(object(block)["items"]), nil, "blocks."+name, next, depth+1)
			} else {
				checkLinks(e, at)
				if key, ok := e["category"].(string); ok && categories[key] == nil {
					add(at, "unknown category "+key)
				}
			}
		}
	}
	// Raw choice order is significant and must survive both validation and persistence.
	var rawRoot struct {
		Days map[string]struct{ Choices json.RawMessage }
	}
	_ = json.Unmarshal(raw, &rawRoot)
	for name, value := range days {
		day := object(value)
		choices := object(day["choices"])
		if choices == nil {
			choices = map[string]any{}
		}
		earlier := map[string]any{}
		for _, key := range orderedKeys(rawRoot.Days[name].Choices) {
			choice := object(choices[key])
			where := "days." + name + ".choices." + key
			checkWhen(choice["active_when"], earlier, where+".active_when")
			options := object(choice["options"])
			valid := func(v any, wd any) bool {
				if choice["type"] == "toggle" {
					_, ok := v.(bool)
					return ok
				}
				opt := object(options[str(v)])
				return opt != nil && (opt["only_on"] == nil || has(opt["only_on"], wd))
			}
			for _, wd := range list(day["on"]) {
				def := choice["default"]
				if byDay := object(def); byDay != nil {
					def = byDay[str(wd)]
				}
				if !valid(def, wd) {
					add(where+".default", "no valid default for "+str(wd))
				}
			}
			earlier[key] = choice
		}
		walk(list(day["items"]), choices, "days."+name+".items", nil, 0)
	}
	// Blocks store relative durations; start times belong to template occurrences.
	for name, block := range blocks {
		if key, ok := object(block)["category"].(string); ok && categories[key] == nil {
			add("blocks."+name, "unknown category "+key)
		}
		entries := list(object(block)["items"])
		walk(entries, nil, "blocks."+name, []string{name}, 0)
	}

	if len(problems) > 0 {
		return fmt.Errorf("%s", strings.Join(problems, "\n"))
	}
	return nil
}

func orderedKeys(raw []byte) []string {
	d := json.NewDecoder(bytes.NewReader(raw))
	if _, err := d.Token(); err != nil {
		return nil
	}
	var keys []string
	for d.More() {
		token, err := d.Token()
		if err != nil {
			break
		}
		keys = append(keys, token.(string))
		var value json.RawMessage
		if err := d.Decode(&value); err != nil {
			break
		}
	}
	return keys
}
