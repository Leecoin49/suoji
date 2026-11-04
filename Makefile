.DEFAULT_GOAL := help

PNPM ?= pnpm
CARGO ?= cargo
TAURI_DEV_PORT ?= 1420

.PHONY: help install dev dev-web build check check-web check-rust fmt package clean

help:
	@printf '%s\n' 'SuoJi development targets:'
	@printf '%s\n' ''
	@printf '%s\n' 'App:'
	@printf '  %-18s %s\n' 'make' 'Show this help'
	@printf '  %-18s %s\n' 'make dev' 'Start the Tauri desktop dev environment (HMR)'
	@printf '  %-18s %s\n' 'make dev-web' 'Start only the Vite dev server'
	@printf '  %-18s %s\n' 'make build' 'Type-check the frontend and build it'
	@printf '  %-18s %s\n' 'make package' 'Build the desktop app and its bundles for this platform'
	@printf '  %-18s %s\n' 'make clean' 'Remove Rust build artifacts'
	@printf '%s\n' ''
	@printf '%s\n' 'Checks:'
	@printf '  %-18s %s\n' 'make check' 'Run every check (web + rust)'
	@printf '  %-18s %s\n' 'make check-web' 'vue-tsc type check'
	@printf '  %-18s %s\n' 'make check-rust' 'cargo fmt --check + clippy -D warnings'
	@printf '  %-18s %s\n' 'make fmt' 'Format Rust sources'
	@printf '%s\n' ''
	@printf '%s\n' 'Setup:'
	@printf '  %-18s %s\n' 'make install' 'Install frontend dependencies'

install:
	$(PNPM) install --frozen-lockfile

dev:
	$(PNPM) tauri dev

dev-web:
	$(PNPM) dev

build:
	$(PNPM) build

check: check-web check-rust

check-web:
	$(PNPM) exec vue-tsc --noEmit

check-rust:
	$(CARGO) fmt --manifest-path src-tauri/Cargo.toml --check
	$(CARGO) clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

fmt:
	$(CARGO) fmt --manifest-path src-tauri/Cargo.toml

package:
	$(PNPM) tauri build

clean:
	$(CARGO) clean --manifest-path src-tauri/Cargo.toml
