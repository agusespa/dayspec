package routine

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

const minimal = `{"days":{"saturday":{"on":["mon","tue","wed","thu","fri","sat","sun"],"items":[{"title":"Wake","duration":5,"time":"08:00"}]}}}`

func testStore(t *testing.T) (*Store, []byte) {
	t.Helper()
	schema, err := os.ReadFile("../../routine.schema.json")
	if err != nil {
		t.Fatal(err)
	}
	store, err := Open(filepath.Join(t.TempDir(), "data", "routine.json"), []byte(minimal), schema)
	if err != nil {
		t.Fatal(err)
	}
	return store, schema
}

func TestPersistenceAndRevision(t *testing.T) {
	s, schema := testStore(t)
	initial := s.Get()
	edited := strings.Replace(minimal, "Wake", "Read", 1)
	saved, err := s.Save([]byte(edited), initial.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Revision == initial.Revision {
		t.Fatal("revision did not change")
	}
	restarted, err := Open(s.path, []byte(minimal), schema)
	if err != nil {
		t.Fatal(err)
	}
	if string(restarted.Get().Routine) != edited {
		t.Fatal("deployment overwrote edits")
	}
	if _, err := s.Save([]byte(minimal), initial.Revision); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale edit accepted: %v", err)
	}
	copy := s.Get()
	copy.Routine[0] = '['
	if string(s.Get().Routine) != edited {
		t.Fatal("caller mutated stored routine")
	}
}

func TestConcurrentEdits(t *testing.T) {
	s, _ := testStore(t)
	initial := s.Get()
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for _, title := range []string{"Read", "Walk"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := s.Save([]byte(strings.Replace(minimal, "Wake", title, 1)), initial.Revision)
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	success, conflicts := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, ErrConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflicts != 1 {
		t.Fatalf("success=%d conflict=%d", success, conflicts)
	}
}

func TestFailedWriteKeepsActiveRoutine(t *testing.T) {
	s, _ := testStore(t)
	initial := s.Get()
	// A path beneath an ordinary file cannot be created, even when tests run as root.
	s.path = filepath.Join(s.path, "cannot-write.json")
	if _, err := s.Save([]byte(strings.Replace(minimal, "Wake", "Read", 1)), initial.Revision); err == nil {
		t.Fatal("expected write failure")
	}
	if string(s.Get().Routine) != minimal {
		t.Fatal("failed write changed active routine")
	}
}

func TestCorruptStoredRoutineFailsStartup(t *testing.T) {
	s, schema := testStore(t)
	if err := os.WriteFile(s.path, []byte(`{"broken":true}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(s.path, []byte(minimal), schema); err == nil {
		t.Fatal("corrupt data was ignored")
	}
	data, _ := os.ReadFile(s.path)
	if string(data) != `{"broken":true}` {
		t.Fatal("corrupt file overwritten")
	}
}

func TestValidation(t *testing.T) {
	s, _ := testStore(t)
	cases := []struct{ name, patch, want string }{
		{"schema", `{"days":{"saturday":{"on":["mon"],"items":[{"title":"Wake","time":"99:00","duration":5}]}},"settings":{"holiday":"saturday"}}`, "pattern"},
		{"overlapping weekdays", `{"days":{"saturday":{"on":["mon"],"items":[]},"other":{"on":["mon"],"items":[]}},"settings":{"holiday":"saturday"}}`, "more than one template"},
		{"holiday", `{"settings":{"holiday":"absent"}}`, "unknown template"},
		{"block", `{"items":[{"use":"absent","time":"08:00"}]}`, "unknown block"},
		{"category", `{"categories":{"chores":{"name":"Chores","color":"orange"}},"items":[{"title":"Wake","category":"absent","duration":5,"time":"08:00"}]}`, "unknown category"},
		{"category in block", `{"blocks":{"b":{"name":"b","items":[{"title":"Wash","category":"absent","duration":5}]}}}`, "unknown category"},
		{"block category", `{"blocks":{"b":{"name":"b","category":"absent","items":[{"title":"Wash","duration":5}]}}}`, "unknown category"},
		{"category colour", `{"categories":{"chores":{"name":"Chores","color":"#ff0000"}}}`, "categories"},
		{"legacy kind", `{"items":[{"title":"Wake","kind":"maintenance","duration":5,"time":"08:00"}]}`, "additional properties"},
		{"link", `{"items":[{"title":"Wake","link":"absent","duration":5,"time":"08:00"}]}`, "pattern"},
		{"choice", `{"items":[{"alternative":"place","paths":{"home":[{"title":"Wake","duration":5,"time":"08:00"}]}}]}`, "unknown alternative"},
		{"option", `{"choices":{"place":{"options":{"home":{},"office":{}},"default":"home"}},"items":[{"alternative":"place","paths":{"beach":[{"title":"Wake","duration":5,"time":"08:00"}]}}]}`, "unknown option"},
		{"default", `{"choices":{"gym":{"options":{"yes":{"label":"Yes"},"no":{"label":"No"}},"default":{"mon":"no"}}}}`, "no valid default"},
		{"cycle", `{"blocks":{"loop":{"name":"loop","items":[{"use":"loop"}]}},"items":[{"use":"loop","time":"08:00"}]}`, "circular block"},
		{"list overrides", `{"blocks":{"pair":{"name":"pair","items":[{"title":"Tea","duration":5},{"title":"Coffee","duration":5}]}},"items":[{"use":"pair","end":"08:00","time":"08:00"}]}`, "additional properties"},
		{"timed child", `{"items":[{"title":"Wake","children":[{"title":"Child","time":"08:00","duration":5}],"duration":5,"time":"08:00"}]}`, "children"},
		{"shared timed child", `{"blocks":{"timed":{"name":"timed","items":[{"title":"Timed","time":"08:00","duration":5}]}},"items":[{"title":"Wake","children":[{"use":"timed"}],"duration":5,"time":"08:00"}]}`, "children"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var root, patch map[string]any
			_ = json.Unmarshal([]byte(minimal), &root)
			_ = json.Unmarshal([]byte(tc.patch), &patch)
			day := object(object(root["days"])["saturday"])
			for k, v := range patch {
				if k == "items" || k == "choices" {
					day[k] = v
				} else {
					root[k] = v
				}
			}
			raw, _ := json.Marshal(root)
			if err := s.Validate(raw); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("wanted %q, got %v", tc.want, err)
			}
			before := s.Get()
			if _, err := s.Save(raw, before.Revision); err == nil {
				t.Fatal("invalid save accepted")
			}
			if s.Get().Revision != before.Revision {
				t.Fatal("invalid save changed state")
			}
		})
	}
}

func TestChoiceOrderSurvivesSave(t *testing.T) {
	s, schema := testStore(t)
	raw := strings.Replace(minimal, `"items":`, `"choices":{"z_location":{"options":{"home":{},"office":{}},"default":"home"},"a_gym":{"options":{"yes":{"label":"Yes"},"no":{"label":"No"}},"default":"yes"}},"items":`, 1)
	saved, err := s.Save([]byte(raw), s.Get().Revision)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(saved.Routine), `"z_location":{"options"`) {
		t.Fatal("choice missing")
	}
	reopened, err := Open(s.path, []byte(minimal), schema)
	if err != nil {
		t.Fatal(err)
	}
	if string(reopened.Get().Routine) != raw {
		t.Fatal("choice order changed")
	}
}

func TestBoundsBlockExpansion(t *testing.T) {
	s, _ := testStore(t)
	var root map[string]any
	_ = json.Unmarshal([]byte(minimal), &root)
	blocks := map[string]any{"b16": map[string]any{"name": "Leaf", "items": []any{map[string]any{"title": "Leaf", "duration": 5}}}}
	for n := 15; n >= 0; n-- {
		name := fmt.Sprintf("b%d", n+1)
		blocks[fmt.Sprintf("b%d", n)] = map[string]any{"name": name, "items": []any{map[string]any{"use": name}, map[string]any{"use": name}}}
	}
	root["blocks"] = blocks
	object(object(root["days"])["saturday"])["items"] = []any{map[string]any{"use": "b0", "time": "08:00"}}
	raw, _ := json.Marshal(root)
	if err := s.Validate(raw); err == nil || !strings.Contains(err.Error(), "exceeds 10000") {
		t.Fatalf("expected bounded expansion: %v", err)
	}
}

func TestEmptyTemplateCanBeSavedAndReopened(t *testing.T) {
	s, schema := testStore(t)
	empty := strings.Replace(minimal, `[{"title":"Wake"}]`, `[]`, 1)
	if _, err := s.Save([]byte(empty), s.Get().Revision); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(s.path, []byte(minimal), schema)
	if err != nil {
		t.Fatal(err)
	}
	if string(reopened.Get().Routine) != empty {
		t.Fatal("empty template was not persisted")
	}
}

func TestPartialAndEmptyLibraryPersist(t *testing.T) {
	s, schema := testStore(t)
	for _, value := range []string{
		`{"days":{"monday":{"on":["mon"],"items":[]}}}`,
		`{"days":{}}`,
		`{"days":{"monday":{"on":["mon"],"choices":{"place":{"options":{"home":{},"office":{"only_on":["tue"]}},"default":{"mon":"home","tue":"office"}}},"items":[]}}}`,
	} {
		if _, err := s.Save([]byte(value), s.Get().Revision); err != nil {
			t.Fatal(err)
		}
		reopened, err := Open(s.path, []byte(minimal), schema)
		if err != nil {
			t.Fatal(err)
		}
		if string(reopened.Get().Routine) != value {
			t.Fatal("library was not persisted")
		}
	}
}

func TestBlockDurationAndStartTime(t *testing.T) {
	s, _ := testStore(t)
	value := `{"blocks":{"morning":{"name":"Morning","items":[{"title":"Stretch","duration":15}]}},"days":{"mon":{"on":["mon"],"items":[{"use":"morning","time":"08:00"}]}}}`
	if _, err := s.Save([]byte(value), s.Get().Revision); err != nil {
		t.Fatal(err)
	}
	for _, duration := range []string{"0", "-1", "1.5", "1441", `"15"`} {
		invalid := strings.Replace(value, `"duration":15`, `"duration":`+duration, 1)
		if _, err := s.Save([]byte(invalid), s.Get().Revision); err == nil {
			t.Fatalf("accepted duration %s", duration)
		}
	}
}

func TestAutomaticHolidayPreference(t *testing.T) {
	s, _ := testStore(t)
	for _, value := range []string{"true", "false"} {
		edited := strings.Replace(minimal, `"days":`, `"settings":{"automatic_swedish_holidays":`+value+`},"days":`, 1)
		if _, err := s.Save([]byte(edited), s.Get().Revision); err != nil {
			t.Fatal(err)
		}
	}
	invalid := strings.Replace(minimal, `"days":`, `"settings":{"automatic_swedish_holidays":"false"},"days":`, 1)
	if _, err := s.Save([]byte(invalid), s.Get().Revision); err == nil {
		t.Fatal("accepted a non-boolean holiday preference")
	}
}

func TestUnusedBlocks(t *testing.T) {
	s, _ := testStore(t)
	for _, blocks := range []string{
		`{"unused":[{"use":"missing"}]}`,
		`{"unused":[{"use":"unused"}]}`,
		`{"unused":{"title":"Unused","link":"missing","duration":5}}`,
		`{"unused":{"title":"Parent","children":[{"title":"Child","time":"08:00","duration":5}],"duration":5}}`,
	} {
		raw := []byte(`{"days":{},"blocks":` + blocks + `}`)
		if err := s.Validate(raw); err == nil {
			t.Fatalf("accepted invalid unused block: %s", blocks)
		}
	}
	raw := []byte(`{"days":{},"blocks":{"unused":{"name":"Unused","items":[{"title":"Unused","duration":5}]}}}`)
	if err := s.Validate(raw); err != nil {
		t.Fatal(err)
	}
}

func TestUnavailableScalarDefault(t *testing.T) {
	s, _ := testStore(t)
	raw := []byte(`{"days":{"weekday":{"on":["mon","tue"],"items":[],"choices":{"place":{"options":{"home":{"only_on":["mon"]},"office":{}},"default":"home"}}}}}`)
	if err := s.Validate(raw); err == nil {
		t.Fatal("accepted default unavailable on Tuesday")
	}
}

func TestRejectsSchemaVersion(t *testing.T) {
	s, _ := testStore(t)
	if err := s.Validate([]byte(`{"version":1,"days":{}}`)); err == nil {
		t.Fatal("accepted removed version field")
	}
}

func TestActivityNotes(t *testing.T) {
	s, _ := testStore(t)
	raw := []byte(`{"days":{"daily":{"on":["mon"],"items":[{"title":"Morning","note":"Water\nWash face","duration":5,"time":"08:00"}]}}}`)
	saved, err := s.Save(raw, s.Get().Revision)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(saved.Routine), `"note":"Water\nWash face"`) {
		t.Fatal("activity note changed")
	}
	if err := s.Validate([]byte(`{"blocks":{"morning":{"name":"Morning","items":[{"title":"Wash","duration":5}]}},"days":{"daily":{"on":["mon"],"items":[{"use":"morning","children":[{"title":"Water","duration":5}],"time":"08:00"}]}}}`)); err == nil {
		t.Fatal("accepted checklist override")
	}
}

func TestCategories(t *testing.T) {
	s, _ := testStore(t)
	raw := []byte(`{"categories":{"chores":{"name":"Chores","color":"orange"}},"blocks":{"b":{"name":"b","category":"chores","items":[{"title":"Wash","category":"chores","duration":5}]}},"days":{"daily":{"on":["mon"],"items":[{"title":"Laundry","category":"chores","duration":5,"time":"08:00"},{"use":"b","time":"08:00"}]}}}`)
	if _, err := s.Save(raw, s.Get().Revision); err != nil {
		t.Fatal(err)
	}
}

func TestCanonicalModels(t *testing.T) {
	s, schema := testStore(t)
	good := []byte(`{"blocks":{"stable":{"name":"Wake Up!","items":[{"title":"Same","duration":5}]}},"days":{"daily":{"on":["mon"],"items":[{"title":"Same","duration":60,"time":"07:00"},{"use":"stable","time":"08:00"}]}},"settings":{"holiday":"daily"}}`)
	saved, err := s.Save(good, s.Get().Revision)
	if err != nil {
		t.Fatal(err)
	}
	renamed := strings.Replace(string(good), "Wake Up!", "Morning — Routine", 1)
	if _, err = s.Save([]byte(renamed), saved.Revision); err != nil {
		t.Fatal(err)
	}
	restarted, err := Open(s.path, []byte(minimal), schema)
	if err != nil {
		t.Fatal(err)
	}
	if string(restarted.Get().Routine) != renamed {
		t.Fatal("restart changed the routine")
	}
	for _, invalid := range []string{
		strings.Replace(renamed, `"duration":5`, `"time":"08:00"`, 1),
		strings.Replace(renamed, `"duration":5`, `"duration":5,"time":"08:00"`, 1),
		strings.Replace(renamed, `"duration":60`, `"duration":60,"end":"08:00"`, 1),
		strings.Replace(renamed, `"duration":60`, `"duration":60,"link":"https://"`, 1),
	} {
		if err := s.Validate([]byte(invalid)); err == nil {
			t.Fatalf("accepted invalid timing or URL: %s", invalid)
		}
	}
}

func TestCalendarPreference(t *testing.T) {
	s, _ := testStore(t)
	for _, provider := range []string{"google", "apple", "unsupported"} {
		t.Run(provider, func(t *testing.T) {
			data := []byte(fmt.Sprintf(`{"days":{},"settings":{"calendar":%q}}`, provider))
			if err := s.Validate(data); (err == nil) != (provider == "google") {
				t.Fatalf("Validate error = %v for calendar %q", err, provider)
			}
		})
	}
}

func TestEmptyAlternativePersists(t *testing.T) {
	s, schema := testStore(t)
	raw := []byte(`{"days":{"saturday":{"on":["mon"],"choices":{"gym":{"options":{"yes":{"label":"Yes"},"no":{"label":"No"}},"default":"no"}},"items":[{"alternative":"gym","paths":{"yes":[{"title":"Lift","duration":45,"time":"08:00"}],"no":[]}}]}}}`)
	if _, err := s.Save(raw, s.Get().Revision); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(s.path, []byte(minimal), schema)
	if err != nil {
		t.Fatal(err)
	}
	if string(reopened.Get().Routine) != string(raw) {
		t.Fatal("empty alternative was not preserved")
	}
}

func TestBranchOnlyConditions(t *testing.T) {
	s, _ := testStore(t)
	invalidEntries := []string{
		`{"title":"Work","duration":10,"when":{"days":["mon"]}}`,
		`{"use":"shared","when":{"days":["mon"]}}`,
		`{"items":[]}`,
		`{"when":{},"items":[]}`,
	}
	for _, entry := range invalidEntries {
		raw := []byte(`{"days":{"daily":{"on":["mon"],"items":[` + entry + `]}}}`)
		if err := s.Validate(raw); err == nil {
			t.Fatalf("accepted invalid entry: %s", entry)
		}
	}
	invalidShared := []string{
		`{"title":"Work","duration":10,"when":{"days":["mon"]}}`,
		`{"when":{"days":["mon"]},"items":[{"title":"Work","duration":10,"time":"08:00"}]}`,
		`{"title":"Work","duration":10,"time":"08:00"}`,
		`{"title":"Work","duration":10,"approx":true}`,
		`{"use":"inner","time":"08:00"}`,
		`{"use":"inner","when":{"days":["mon"]}}`,
	}
	for _, entry := range invalidShared {
		for _, items := range []string{`[]`, `[{"use":"shared","time":"08:00"}]`} {
			raw := []byte(`{"days":{"daily":{"on":["mon"],"items":` + items + `}},"blocks":{"shared":{"name":"Shared","items":[` + entry + `]},"inner":{"name":"Inner","items":[{"title":"Tea","duration":5}]}}}`)
			if err := s.Validate(raw); err == nil {
				t.Fatalf("accepted invalid shared entry: %s", entry)
			}
		}
	}
}

func TestNamedAlternativesOnly(t *testing.T) {
	s, _ := testStore(t)
	for _, choice := range []string{
		`{"type":"toggle","default":false}`,
		`{"type":"select","options":{"home":{},"out":{}},"default":"home"}`,
		`{"options":{"home":{},"out":{}},"default":false}`,
		`{"options":{"home":{},"out":{}},"default":{"mon":true}}`,
		`{"options":{"home":{}},"default":"home"}`,
	} {
		raw := []byte(`{"days":{"daily":{"on":["mon"],"choices":{"evening":` + choice + `},"items":[]}}}`)
		if err := s.Validate(raw); err == nil {
			t.Fatalf("accepted invalid alternative: %s", choice)
		}
	}
	raw := []byte(`{"days":{"daily":{"on":["mon"],"choices":{"evening":{"options":{"home":{},"out":{}},"default":"home"}},"items":[{"when":{"evening":true},"items":[]}]}}}`)
	if err := s.Validate(raw); err == nil {
		t.Fatal("accepted boolean branch condition")
	}
}

func TestTemplateTimesAndSingleLink(t *testing.T) {
	s, _ := testStore(t)
	for _, entry := range []string{`{"title":"Walk","duration":10}`, `{"use":"morning"}`} {
		for _, items := range []string{`[` + entry + `]`, `[{"when":{"days":["mon"]},"items":[` + entry + `]}]`} {
			raw := []byte(`{"blocks":{"morning":{"name":"Morning","items":[{"title":"Wash","duration":5}]}},"days":{"day":{"on":["mon"],"items":` + items + `}}}`)
			if err := s.Validate(raw); err == nil {
				t.Fatalf("accepted missing template time: %s", items)
			}
		}
	}
	valid := `{"days":{"day":{"on":["mon"],"items":[{"title":"Read","duration":10,"time":"08:00","link":"https://example.com/read"}]}},"blocks":{"morning":{"name":"Morning","items":[{"title":"Wash","duration":5,"link":"https://example.com/read"}]}}}`
	if err := s.Validate([]byte(valid)); err != nil {
		t.Fatal(err)
	}
	for _, link := range []string{`[]`, `["https://example.com/read"]`, `["https://example.com/read","https://example.com/other"]`} {
		if err := s.Validate([]byte(strings.ReplaceAll(valid, `"link":"https://example.com/read"`, `"link":`+link))); err == nil {
			t.Fatalf("accepted URL list: %s", link)
		}
	}
}

func TestExplicitForks(t *testing.T) {
	s, schema := testStore(t)
	choices := `{"location":{"options":{"home":{},"office":{}},"default":"home"},"gym":{"options":{"train":{},"rest":{}},"default":"train"}}`
	fork := `{"alternative":"location","paths":{"home":[{"alternative":"gym","paths":{"train":[{"title":"Lift","time":"17:00","duration":45}],"rest":[]}}],"office":[]}}`
	raw := []byte(`{"days":{"day":{"on":["mon"],"choices":` + choices + `,"items":[` + fork + `]}}}`)
	saved, err := s.Save(raw, s.Get().Revision)
	if err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(s.path, []byte(minimal), schema)
	if err != nil {
		t.Fatal(err)
	}
	if string(saved.Routine) != string(reopened.Get().Routine) {
		t.Fatal("fork paths changed on reopen")
	}
	for _, invalid := range []string{
		strings.Replace(string(raw), `"alternative":"location"`, `"alternative":"missing"`, 1),
		strings.Replace(string(raw), `"office":[]`, `"missing":[]`, 1),
		strings.Replace(string(raw), `"alternative":"gym"`, `"alternative":"location"`, 1),
		strings.Replace(string(raw), `"default":"home"`, `"default":"home","active_when":{"gym":"train"}`, 1),
	} {
		if err := s.Validate([]byte(invalid)); err == nil {
			t.Fatalf("accepted invalid fork: %s", invalid)
		}
	}
}
