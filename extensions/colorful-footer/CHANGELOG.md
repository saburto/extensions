# Changelog

## [0.2.0](https://github.com/saburto/extensions/compare/pi-colorful-footer-v0.1.0...pi-colorful-footer-v0.2.0) (2026-07-13)


### Features

* add config ([d8ba4b0](https://github.com/saburto/extensions/commit/d8ba4b0a76b55d80eea12e2b8ba537e306d29dd4))
* add folder ([c5b600f](https://github.com/saburto/extensions/commit/c5b600f8de3b51a4d0618be8e5a55ed4865b203c))
* add status sections ([76837b4](https://github.com/saburto/extensions/commit/76837b4666593dbc55cb15d00fd392e30aeea4ed))
* **colorful-footer:** add colorful working indicator with themed spinner ([6768977](https://github.com/saburto/extensions/commit/6768977322befbbe91f5188ffb56a6b52bc2306d))


### Bug Fixes

* cache rate hit ([3405c1a](https://github.com/saburto/extensions/commit/3405c1ae7da412165b9dad069997d3370aa5a131))
* sync release-please manifest to last tagged release (0.1.0) ([fabaf56](https://github.com/saburto/extensions/commit/fabaf56db2d2e309ca968c29696c5b1bd3093430))
* trigger release for colorful-footer ([7b9b60a](https://github.com/saburto/extensions/commit/7b9b60a069620e89cb3386e9a5953eb90150f3f3))


### Miscellaneous

* add README ([b576e23](https://github.com/saburto/extensions/commit/b576e23c19827f83410e9b4e9de69ec4ac8bbe90))
* bump new version ([5185eb6](https://github.com/saburto/extensions/commit/5185eb6868dcc9fa98b593e832db7e37e587eaa8))
* fix name in MIT license ([37b1a09](https://github.com/saburto/extensions/commit/37b1a09faab7cd64b0b422461d67120504b73d9d))
* **main:** release pi-colorful-footer 0.0.3 ([4a08326](https://github.com/saburto/extensions/commit/4a083262a0f2dc7efbf82587b61fb312667c0352))
* **main:** release pi-colorful-footer 0.0.3 ([e24cd0a](https://github.com/saburto/extensions/commit/e24cd0aaba736c8d818938b49a1284161122304b))


### Code Refactoring

* **colorful-footer:** rename package to @saburto/pi-colorful-footer ([b22b596](https://github.com/saburto/extensions/commit/b22b596de4145b3eb7691a0541b4a416fee7b30b))

## [Unreleased]

### Features

* Extension statuses from `ctx.ui.setStatus()` now appear in the footer (🔌 icon)
* New `statuses` section in config: customize icon, colors, order, or set `hidden: true` to disable

### Bug Fixes

* Fix cache rate hit calculation ([3405c1a](https://github.com/saburto/extensions/commit/3405c1a))

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
