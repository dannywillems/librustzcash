.PHONY: help
help: ## Ask for help!
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; \
		{printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

.PHONY: doc-install
doc-install: ## Install documentation dependencies
	npm install

.PHONY: doc-dev
doc-dev: ## Run documentation dev server
	npx docusaurus start

.PHONY: doc-build
doc-build: ## Build documentation for production
	npx docusaurus build

.PHONY: doc-serve
doc-serve: ## Serve built documentation locally
	npx docusaurus serve

.PHONY: doc-clear
doc-clear: ## Clear documentation cache
	npx docusaurus clear

.PHONY: typecheck
typecheck: ## Type-check the Docusaurus config
	npx tsc --noEmit

.PHONY: clean
clean: ## Remove build outputs and Docusaurus cache
	rm -rf build .docusaurus node_modules
