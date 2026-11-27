.PHONY: install test test-backend test-frontend typecheck build docker-build run


PYTHON := $(shell if [ -x ibvap-backend/.venv/bin/python ]; then printf '%s' ibvap-backend/.venv/bin/python; elif [ -x ibvap-backend/venv/bin/python ]; then printf '%s' ibvap-backend/venv/bin/python; else command -v python3; fi)




install:
	@if [ ! -x "$(PYTHON)" ]; then python3 -m venv ibvap-backend/.venv; fi
	$(PYTHON) -m pip install -r ibvap-backend/requirements.lock
	cd frontend && npm ci

test: test-backend test-frontend

test-backend:
	PYTHONPATH=ibvap-backend $(PYTHON) -m unittest discover -s ibvap-backend -p 'test_*.py' -v

test-frontend:
	cd frontend && npm test

typecheck:
	cd frontend && npm run typecheck

build:
	cd frontend && npm run build

docker-build:
	docker build -t ibvap:local .

run:
	./run.sh
