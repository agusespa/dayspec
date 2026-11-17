package main

import (
	"context"
	"errors"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/agusespa/dayspec/internal/routine"
	"github.com/agusespa/dayspec/internal/server"
	"github.com/agusespa/dayspec/internal/ui"
)

func main() {
	port := env("PORT", "8080")

	if len(os.Args) > 1 {
		if len(os.Args) != 2 || os.Args[1] != "healthcheck" {
			log.Print("usage: dayspec [healthcheck]")
			os.Exit(2)
		}
		if err := checkReadiness(context.Background(), "http://127.0.0.1:"+port+"/api/readyz"); err != nil {
			log.Printf("healthcheck: %v", err)
			os.Exit(1)
		}
		return
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	static := ui.FS()
	defaults, err := fs.ReadFile(static, "routine.default.json")
	if err != nil {
		log.Fatalf("bundled routine: %v", err)
	}
	schema, err := fs.ReadFile(static, "routine.schema.json")
	if err != nil {
		log.Fatalf("bundled schema: %v", err)
	}
	store, err := routine.Open(env("ROUTINE_PATH", "data/routine.json"), defaults, schema)
	if err != nil {
		log.Fatalf("template storage: %v", err)
	}

	srv := &http.Server{
		Addr:              net.JoinHostPort(env("HOST", ""), port),
		Handler:           server.New(static, store),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()

	log.Printf("dayspec listening on %s", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("serve: %v", err)
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
