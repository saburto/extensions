# Changelog

## [0.1.0](https://github.com/saburto/extensions/compare/pi-colorful-footer-v0.0.3...pi-colorful-footer-v0.1.0) (2026-06-28)


### Features

* add config ([d8ba4b0](https://github.com/saburto/extensions/commit/d8ba4b0a76b55d80eea12e2b8ba537e306d29dd4))
* add status sections ([76837b4](https://github.com/saburto/extensions/commit/76837b4666593dbc55cb15d00fd392e30aeea4ed))


### Bug Fixes

* cache rate hit ([3405c1a](https://github.com/saburto/extensions/commit/3405c1ae7da412165b9dad069997d3370aa5a131))


### Miscellaneous

* bump new version ([5185eb6](https://github.com/saburto/extensions/commit/5185eb6868dcc9fa98b593e832db7e37e587eaa8))

## [Unreleased]

### Features

* Extension statuses from `ctx.ui.setStatus()` now appear in the footer (🔌 icon)
* New `statuses` section in config: customize icon, colors, order, or set `hidden: true` to disable

## [0.1.0](https://github.com/saburto/extensions/compare/pi-colorful-footer-v0.0.3...pi-colorful-footer-v0.1.0) (2026-06-20)

### Features

* Add configuration file support (~/.pi/agent/colorful-footer.json and .pi/colorful-footer.json)
* Customizable icons, foreground/background colors per section (theme names + hex RGB like `#ff0000`)
* Conditional rules based on model ID patterns (e.g. red for Opus, green for DeepSeek)
* Hide individual sections via config
* Section reordering via order field
* Per-thinking-level icon/color overrides
* `/colorful-config` chat-based configuration — feeds README as context, LLM guides the user conversationally and edits config files

## [0.0.3](https://github.com/saburto/extensions/compare/pi-colorful-footer-v0.0.2...pi-colorful-footer-v0.0.3) (2026-06-20)


### Bug Fixes

* trigger release for colorful-footer ([7b9b60a](https://github.com/saburto/extensions/commit/7b9b60a069620e89cb3386e9a5953eb90150f3f3))
