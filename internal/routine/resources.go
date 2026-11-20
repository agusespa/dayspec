package routine

import (
	"encoding/json"
	"errors"
	"regexp"
)

var (
	ErrNotFound         = errors.New("resource not found")
	ErrRevisionRequired = errors.New("a revision is required; read the routine before saving")
	ErrInvalidResource  = errors.New("invalid resource or ID")
	resourceID          = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)
)

type ValidationError struct{ Cause error }

func (e *ValidationError) Error() string { return e.Cause.Error() }
func (e *ValidationError) Unwrap() error { return e.Cause }

// ReadResource returns a resource and revision from the same snapshot.
func (s *Store) ReadResource(section, id string) (json.RawMessage, string, error) {
	if section != "templates" && section != "blocks" && section != "settings" {
		return nil, "", ErrInvalidResource
	}
	current := s.Get()
	root := map[string]json.RawMessage{}
	_ = json.Unmarshal(current.Routine, &root)
	value := root[section]
	if len(value) == 0 {
		value = json.RawMessage(`{}`)
	}
	if id != "" {
		if section == "settings" || !resourceID.MatchString(id) {
			return nil, "", ErrInvalidResource
		}
		collection := map[string]json.RawMessage{}
		_ = json.Unmarshal(value, &collection)
		var ok bool
		value, ok = collection[id]
		if !ok {
			return nil, "", ErrNotFound
		}
	}
	return value, current.Revision, nil
}

// ChangeResource edits a detached snapshot.
// Save validates the complete library and compares revisions under its write lock.
func (s *Store) ChangeResource(section, id string, value json.RawMessage, revision string, remove bool) (Snapshot, error) {
	if revision == "" {
		return Snapshot{}, ErrRevisionRequired
	}
	if section != "templates" && section != "blocks" && section != "settings" {
		return Snapshot{}, ErrInvalidResource
	}
	if (section == "settings" && (id != "" || remove)) || (section != "settings" && !resourceID.MatchString(id)) {
		return Snapshot{}, ErrInvalidResource
	}
	current := s.Get()
	if current.Revision != revision {
		return Snapshot{}, ErrConflict
	}
	root := map[string]json.RawMessage{}
	_ = json.Unmarshal(current.Routine, &root)
	if !remove && !json.Valid(value) {
		return Snapshot{}, &ValidationError{errors.New("send valid JSON for the resource")}
	}
	if section == "settings" {
		root[section] = value
	} else {
		collection := map[string]json.RawMessage{}
		if raw := root[section]; len(raw) > 0 {
			_ = json.Unmarshal(raw, &collection)
		}
		if remove {
			if _, ok := collection[id]; !ok {
				return Snapshot{}, ErrNotFound
			}
			delete(collection, id)
			if section == "templates" {
				settings := map[string]json.RawMessage{}
				_ = json.Unmarshal(root["settings"], &settings)
				var holiday string
				_ = json.Unmarshal(settings["holiday_template"], &holiday)
				if holiday == id {
					delete(settings, "holiday_template")
					root["settings"], _ = json.Marshal(settings)
				}
			}
		} else {
			collection[id] = value
		}
		root[section], _ = json.Marshal(collection)
	}
	data, err := json.Marshal(root)
	if err != nil {
		return Snapshot{}, err
	}
	return s.Save(data, revision)
}
