package routine

import (
	"errors"
	"fmt"
	"maps"
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
	templates, blocks, categories := object(root["templates"]), object(root["blocks"]), object(root["categories"])
	// A block used in several places reports each problem once; maps iterate randomly, so sort.
	problems := map[string]bool{}
	add := func(where, message string) { problems[where+": "+message] = true }
	for _, wd := range weekdays {
		owners := 0
		for _, d := range templates {
			if has(object(d)["on"], wd) {
				owners++
			}
		}
		if owners > 1 {
			add("templates", "more than one template covers "+wd)
		}
	}
	if holiday := str(object(root["settings"])["holiday_template"]); holiday != "" && templates[holiday] == nil {
		add("settings.holiday_template", "unknown template "+holiday)
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
				name := str(e["choice"])
				definition := object(choices[name])
				if definition == nil {
					add(at, "unknown choice "+name)
				}
				if slices.Contains(forks, name) {
					add(at, "a choice cannot be nested inside its own branch")
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
	for name, value := range templates {
		day := object(value)
		choices := object(day["choices"])
		if choices == nil {
			choices = map[string]any{}
		}
		for key, value := range choices {
			choice := object(value)
			where := "templates." + name + ".choices." + key
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
		walk(list(day["items"]), choices, "templates."+name+".items", nil, 0, nil)
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
		return errors.New(strings.Join(slices.Sorted(maps.Keys(problems)), "\n"))
	}
	return nil
}
