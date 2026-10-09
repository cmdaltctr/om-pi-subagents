# Changelog

## [0.9.0](https://github.com/cmdaltctr/om-pi-subagents/compare/v0.8.1...v0.9.0) (2026-10-09)


### Features

* add proactive delegation guidance ([9f60eeb](https://github.com/cmdaltctr/om-pi-subagents/commit/9f60eebeb5bc92e590a1ffaf720744546c20c0fb))

## [0.8.1](https://github.com/cmdaltctr/om-pi-subagents/compare/v0.8.0...v0.8.1) (2026-10-09)


### Bug Fixes

* restore themed result panels and fold hint colours ([574c154](https://github.com/cmdaltctr/om-pi-subagents/commit/574c1547592faaf7f69fee82ee0af8a8ac6c432f))

## [0.8.0](https://github.com/cmdaltctr/om-pi-subagents/compare/v0.7.0...v0.8.0) (2026-10-08)


### Features

* accept forgiving typed shortcuts in settings ([44457b3](https://github.com/cmdaltctr/om-pi-subagents/commit/44457b312f4543548135c3fba14ef3f6e7d157c2))
* add inspector margins and wrap picker text ([44457b3](https://github.com/cmdaltctr/om-pi-subagents/commit/44457b312f4543548135c3fba14ef3f6e7d157c2))
* detect installed capability packages from Pi settings ([44457b3](https://github.com/cmdaltctr/om-pi-subagents/commit/44457b312f4543548135c3fba14ef3f6e7d157c2))
* fold result messages and add a result shortcut ([44457b3](https://github.com/cmdaltctr/om-pi-subagents/commit/44457b312f4543548135c3fba14ef3f6e7d157c2))
* launch mapped agents from interactive at-mentions ([44457b3](https://github.com/cmdaltctr/om-pi-subagents/commit/44457b312f4543548135c3fba14ef3f6e7d157c2))

## [0.7.0](https://github.com/cmdaltctr/om-pi-subagents/compare/v0.6.0...v0.7.0) (2026-10-08)


### Features

* refine fleet navigation and inspector ([#18](https://github.com/cmdaltctr/om-pi-subagents/issues/18)) ([045cb6f](https://github.com/cmdaltctr/om-pi-subagents/commit/045cb6f2be2027d3bbf5b7dad3e5626472d2c211))

## [0.6.0](https://github.com/cmdaltctr/om-pi-subagents/compare/v0.5.0...v0.6.0) (2026-10-07)


### ⚠ BREAKING CHANGES

* The default registry is now <agent-dir>/omps/config.yaml. Move existing settings and personas using the migration guide, and update persona paths to ./personas/<name>.md. The fleet starts expanded, view shortcuts default to off, and operator /omps list output is compact.

### Features

* port the Tintin agent tree and move operator settings into omps ([ced13e8](https://github.com/cmdaltctr/om-pi-subagents/commit/ced13e86df02c6f4d2af04f7854239c08648a6ab))

## [0.5.0](https://github.com/cmdaltctr/om-pi-subagents/compare/v0.4.0...v0.5.0) (2026-10-07)


### ⚠ BREAKING CHANGES

* replace ompss commands and delegation approval with omps, replace OMPSS_* variables with OMPS_*, and save fresh runs under omps/runs. Operator migration is manual.

### Features

* rename runtime to OMPS and add release approval ([#13](https://github.com/cmdaltctr/om-pi-subagents/issues/13)) ([e5ad38d](https://github.com/cmdaltctr/om-pi-subagents/commit/e5ad38d6ed50a29cb8c283575a2f1693e80903d2))

## [0.4.0](https://github.com/cmdaltctr/om-pi-subagents/compare/v0.3.0...v0.4.0) (2026-10-07)


### ⚠ BREAKING CHANGES

* Live per-run trees become compact launch acknowledgements. New UI settings live in operator YAML; the legacy display JSON is a read-only fallback.

### Features

* redesign compact subagent fleet ([6d66624](https://github.com/cmdaltctr/om-pi-subagents/commit/6d666249885de876545bb4886b09cbd70e9a3128))

## [0.3.0](https://github.com/cmdaltctr/om-pi-subagents/compare/v0.2.1...v0.3.0) (2026-10-05)


### Features

* add native agent trees and operator settings ([#10](https://github.com/cmdaltctr/om-pi-subagents/issues/10)) ([47c622d](https://github.com/cmdaltctr/om-pi-subagents/commit/47c622d698614295b8ed09c15c1a1b8c418869c8))
* configure parallel capacity and approved nested subagents ([#8](https://github.com/cmdaltctr/om-pi-subagents/issues/8)) ([a999627](https://github.com/cmdaltctr/om-pi-subagents/commit/a999627fbaa05f2625aed03db49addaaad3f53b8))

## [0.2.1](https://github.com/cmdaltctr/om-pi-subagents/compare/v0.2.0...v0.2.1) (2026-10-02)


### Miscellaneous Chores

* release 0.2.1 to ship the new setup guide ([#6](https://github.com/cmdaltctr/om-pi-subagents/issues/6)) ([035d467](https://github.com/cmdaltctr/om-pi-subagents/commit/035d467972ab6fe59e6f025ec1375e8985d143da))

## [0.2.0](https://github.com/cmdaltctr/om-pi-subagents/compare/v0.1.0...v0.2.0) (2026-10-02)


### ⚠ BREAKING CHANGES

* every mapped agent must declare a supported thinking value. Add it to existing mappings before launching.

### Features

* show child run activity in the parent panel ([#1](https://github.com/cmdaltctr/om-pi-subagents/issues/1)) ([4779261](https://github.com/cmdaltctr/om-pi-subagents/commit/4779261c528a14304f2605da497e64f0e892a3ac))

## 0.1.0 (2026-10-01)

### Features

- First release of OMPSS. Map agents in `~/.pi/agent/om-pi-subagents.yaml` and run each one as a native Pi child process.
