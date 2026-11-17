// Package routine validates and persists the editable routine independently of app releases.
package routine

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

var ErrConflict = errors.New("templates changed on the server; reload before saving")

// Snapshot keeps the original JSON order: choices can depend on earlier choices.
type Snapshot struct {
	Routine  json.RawMessage `json:"routine"`
	Revision string          `json:"revision"`
}

type Store struct {
	mu         sync.RWMutex
	path       string
	schema     *jsonschema.Schema
	schemaJSON json.RawMessage
	current    Snapshot
}

// Open seeds a missing file from the bundled routine. Existing edits always win on deployment.
func Open(path string, defaults, schemaJSON []byte) (*Store, error) {
	var doc any
	if err := json.Unmarshal(schemaJSON, &doc); err != nil {
		return nil, err
	}
	compiler := jsonschema.NewCompiler()
	const schemaURL = "https://dayspec.local/routine.schema.json"
	if err := compiler.AddResource(schemaURL, doc); err != nil {
		return nil, err
	}
	schema, err := compiler.Compile(schemaURL)
	if err != nil {
		return nil, err
	}
	s := &Store{path: path, schema: schema, schemaJSON: append(json.RawMessage(nil), schemaJSON...)}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		data = defaults
	} else if err != nil {
		return nil, err
	}
	if err := s.Validate(data); err != nil {
		return nil, fmt.Errorf("invalid routine: %w", err)
	}
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		if err := s.write(data); err != nil {
			return nil, err
		}
	}
	s.current = snapshot(data)
	return s, nil
}

func snapshot(data []byte) Snapshot {
	// Compact without sorting object keys.
	var compact bytes.Buffer
	_ = json.Compact(&compact, data)
	raw := append(json.RawMessage(nil), compact.Bytes()...)
	return Snapshot{Routine: raw, Revision: fmt.Sprintf("\"%x\"", sha256.Sum256(raw))}
}

func (s *Store) Get() Snapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return Snapshot{Routine: append(json.RawMessage(nil), s.current.Routine...), Revision: s.current.Revision}
}

func (s *Store) Validate(data []byte) error {
	if len(data) > 1<<20 {
		return errors.New("routine exceeds 1 MB")
	}
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	if err := s.schema.Validate(value); err != nil {
		return err
	}
	return checkReferences(value.(map[string]any), data)
}

func (s *Store) Save(data []byte, revision string) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if revision == "" {
		return Snapshot{}, ErrRevisionRequired
	}
	if revision != s.current.Revision {
		return Snapshot{}, ErrConflict
	}
	if err := s.Validate(data); err != nil {
		return Snapshot{}, &ValidationError{err}
	}
	next := snapshot(data)
	if err := s.write(next.Routine); err != nil {
		return Snapshot{}, fmt.Errorf("persist templates: %w", err)
	}
	s.current = next
	return next, nil
}

func (s *Store) write(data []byte) error {
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".routine-*.json")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(f.Name()) }()
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), s.path)
}

// Schema is the authoritative contract used for every persisted write.
func (s *Store) Schema() json.RawMessage { return append(json.RawMessage(nil), s.schemaJSON...) }
