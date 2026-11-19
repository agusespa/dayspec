package routine

import (
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
func checkReferences(root map[string]any) error {
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

	checkLink := func(item map[string]any, where string) {
		if item["link"] == nil {
			return
		}
		name := str(item["link"])
		parsed, err := url.Parse(name)
		if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Hostname() == "" {
			add(where, "invalid link URL")
		}
	}
	remaining := 10_000
	var walk func([]any, map[string]any, string, []string, int, []string)
	walk = func(entries []any, choices map[string]any, where string, stack []string, depth int, forks []string) {
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
			if paths := object(e["paths"]); paths != nil {
				name := str(e["alternative"])
				definition := object(choices[name])
				if definition == nil {
					add(at, "unknown alternative "+name)
				}
				if slices.Contains(forks, name) {
					add(at, "an alternative cannot be nested inside itself")
				}
				for option, items := range paths {
					if definition != nil && object(definition["options"])[option] == nil {
						add(at+".paths", "unknown option "+option)
					}
					walk(list(items), choices, at+".paths."+option, stack, depth+1, append(slices.Clone(forks), name))
				}
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
				walk(list(object(block)["items"]), nil, "blocks."+name, next, depth+1, nil)
			} else {
				checkLink(e, at)
				if key, ok := e["category"].(string); ok && categories[key] == nil {
					add(at, "unknown category "+key)
				}
			}
		}
	}
	for name, value := range days {
		day := object(value)
		choices := object(day["choices"])
		if choices == nil {
			choices = map[string]any{}
		}
		for key, value := range choices {
			choice := object(value)
			where := "days." + name + ".choices." + key
			options := object(choice["options"])
			valid := func(v any, wd any) bool {
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
		}
		walk(list(day["items"]), choices, "days."+name+".items", nil, 0, nil)
	}
	// Blocks store relative durations; start times belong to template occurrences.
	for name, block := range blocks {
		if key, ok := object(block)["category"].(string); ok && categories[key] == nil {
			add("blocks."+name, "unknown category "+key)
		}
		entries := list(object(block)["items"])
		walk(entries, nil, "blocks."+name, []string{name}, 0, nil)
	}

	if len(problems) > 0 {
		return fmt.Errorf("%s", strings.Join(problems, "\n"))
	}
	return nil
}
