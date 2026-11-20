package routine

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestResourceEditsPreserveOrderAndOtherData(t *testing.T) {
	s, schema := testStore(t)
	start := s.Get()
	block := json.RawMessage(`{"name":"Wake Up!","items":[{"title":"Wake","duration":5}]}`)
	added, err := s.ChangeResource("blocks", "stable", block, start.Revision, false)
	if err != nil {
		t.Fatal(err)
	}
	template := json.RawMessage(`{"on":["mon","tue","wed","thu","fri","sat","sun"],"choices":{"z_location":{"options":{"home":{},"office":{}},"default":"office"},"a_gym":{"options":{"yes":{"label":"Yes"},"no":{"label":"No"}},"default":"yes"}},"items":[{"use":"stable","time":"07:00"}]}`)
	saved, err := s.ChangeResource("templates", "saturday", template, added.Revision, false)
	if err != nil {
		t.Fatal(err)
	}
	value, revision, err := s.ReadResource("templates", "saturday")
	if err != nil || revision != saved.Revision || !strings.Contains(string(value), `"z_location":{"options"`) {
		t.Fatal(string(value), revision, err)
	}
	renamed, err := s.ChangeResource("blocks", "stable", json.RawMessage(`{"name":"New Name","items":[{"title":"Wake","duration":10}]}`), saved.Revision, false)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(renamed.Routine), `"use":"stable"`) || strings.Index(string(renamed.Routine), `"z_location":`) > strings.Index(string(renamed.Routine), `"a_gym":`) {
		t.Fatal("references or choice order changed")
	}
	if _, err := s.ChangeResource("blocks", "stable", nil, renamed.Revision, true); err == nil {
		t.Fatal("deleted referenced block")
	}
	restarted, err := Open(s.path, []byte(minimal), schema)
	if err != nil {
		t.Fatal(err)
	}
	if restarted.Get().Revision != renamed.Revision {
		t.Fatal("restart changed routine")
	}
	copy := s.Schema()
	copy[0] = '['
	if !json.Valid(s.Schema()) {
		t.Fatal("caller mutated authoritative schema")
	}
}
func TestResourceValidationAndRevisions(t *testing.T) {
	s, _ := testStore(t)
	initial := s.Get()
	cases := []struct {
		section, id string
		value       json.RawMessage
		revision    string
		remove      bool
		want        error
	}{
		{"templates", "new", json.RawMessage(`{}`), "", false, ErrRevisionRequired},
		{"templates", "new", json.RawMessage(`{}`), "stale", false, ErrConflict},
		{"templates", "bad-id", json.RawMessage(`{}`), initial.Revision, false, ErrInvalidResource},
		{"unknown", "x", json.RawMessage(`{}`), initial.Revision, false, ErrInvalidResource},
		{"settings", "x", json.RawMessage(`{}`), initial.Revision, false, ErrInvalidResource},
		{"blocks", "missing", nil, initial.Revision, true, ErrNotFound},
	}
	for _, tc := range cases {
		_, err := s.ChangeResource(tc.section, tc.id, tc.value, tc.revision, tc.remove)
		if !errors.Is(err, tc.want) {
			t.Fatalf("got %v want %v", err, tc.want)
		}
		if s.Get().Revision != initial.Revision {
			t.Fatal("failed edit changed state")
		}
	}
	for _, value := range []json.RawMessage{nil, json.RawMessage(`{`), json.RawMessage(`null`), json.RawMessage(`{"name":"Bad","items":[{"title":"No duration"}]}`)} {
		_, err := s.ChangeResource("blocks", "bad", value, initial.Revision, false)
		var invalid *ValidationError
		if !errors.As(err, &invalid) {
			t.Fatalf("want validation error, got %v", err)
		}
	}
	if _, _, err := s.ReadResource("blocks", "missing"); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	if _, _, err := s.ReadResource("settings", "invalid"); !errors.Is(err, ErrInvalidResource) {
		t.Fatal(err)
	}
	if _, _, err := s.ReadResource("invalid", ""); !errors.Is(err, ErrInvalidResource) {
		t.Fatal(err)
	}
	if _, _, err := s.ReadResource("blocks", "bad!"); !errors.Is(err, ErrInvalidResource) {
		t.Fatal(err)
	}
}
func TestResourceConcurrentEdits(t *testing.T) {
	s, _ := testStore(t)
	revision := s.Get().Revision
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for _, id := range []string{"one", "two"} {
		wg.Go(func() {
			_, err := s.ChangeResource("blocks", id, json.RawMessage(`{"name":"New","items":[{"title":"Item","duration":5}]}`), revision, false)
			results <- err
		})
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
		t.Fatal(success, conflicts)
	}
}
func TestDeleteHolidayTemplateClearsSetting(t *testing.T) {
	s, _ := testStore(t)
	initial := s.Get()
	settings, err := s.ChangeResource("settings", "", json.RawMessage(`{"holiday_template":"saturday","automatic_swedish_holidays":false}`), initial.Revision, false)
	if err != nil {
		t.Fatal(err)
	}
	saved, err := s.ChangeResource("templates", "saturday", nil, settings.Revision, true)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(saved.Routine), `"holiday_template"`) || !strings.Contains(string(saved.Routine), `"automatic_swedish_holidays":false`) {
		t.Fatal(string(saved.Routine))
	}
}
func TestResourceFailedPersistenceKeepsSnapshot(t *testing.T) {
	s, _ := testStore(t)
	before := s.Get()
	s.path = filepath.Join(s.path, "cannot-write")
	if _, err := s.ChangeResource("settings", "", json.RawMessage(`{}`), before.Revision, false); err == nil {
		t.Fatal("write should fail")
	}
	if s.Get().Revision != before.Revision {
		t.Fatal("write changed memory")
	}
}
