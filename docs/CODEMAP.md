# Code map (generated: `node tools/codemap.js --doc`)

Symbols by file and by the section banner they sit under. No line numbers on
purpose: grep the name. Regenerate after any change that moves code around.

## shared/sim.js (4536 lines)

- makeRng, MODES, createGame, setMode, setDraft, rng
- **players**: freeTeam, setTeam, addPlayer, fighters
- **friend or foe**: hostile
- **versus teams: the DAMAGE/EFFECT-path predicate**: allied, alliedIds, rankTeams, teamTally, partyOf, waveOf, setSpectator, updateRadii, removePlayer, stats, playerStats, lvl, efxV
- **per-attacker stack store (elemental)**: stackCount, addStack, clearStacks, worstStack, vampireCharge, hasteOf, fireballHasteOf, arcaneRefund
- **inputs**: setMoveTarget, castSpell
- **Decoy: the mirage (SPELLS.decoy, round 21.6)**: spawnClones, mimicCast, stepClones, spawnFireball, spawnStoredBall, buy, undoBuy
- **draft mode (docs/ROUND12.md S7)**: draftLocked, rollDraftPool, draftDue, draftOptionsFor, rollDraftOffers, grantDraft, draftPick, resolveDraftOffers
- **combat helpers**: applyKnockback, applyDamage, transferDebt, spoonTickDue, kill
- **round flow**: setTesting, arenaStartRadius, startGame, startRound
- **co-op campaign**: coopPrepareRound, coopSpawnWave, makePillars, endRound, afterSummary, setShopReady, setShopPause
- **main step**: step, stepBattle
- **pillar geometry**: resolvePillarHit, collidePillars
- **Genki (issue #12, reworked 2026-08-13)**: genkiState, releaseGenki, stepProjectiles
- **mosquito (elemental)**: mosquitoPair, turnBoomerangHome
- **gale (elemental)**: galeHit, infectMalady, applyElementsHit
- **serialization**: viewStacks, ownStacks, viewEvents, snapshot, segSegDist, segmentPointDist, round2, mapRound, clamp
- **bot AI**: stepBot, botTune, boltEscape, boltAim
- **CC-gated casting (round 20, BOT_CC_CAST)**: ccHeld, ccPinned, heldAim
- **Faker (issue #7)**: driftTo, comboStep, stepFaker
- **Runner (issue #7): the sparring partner**: stepRunner, pilotOwnedSpells, unwedgeFromPillars
- **shared bot helpers**: anyHidden, vanishInPlay, rememberEnemies, enemiesSeen, killLead, leadPull, nearestEnemy, estVel, interceptPoint, scanThreats
- **grunt ★: pure chaos**: stepGrunt, pickPrey
- **berserker ★★: relentless brawler**: stepBerserker
- **stalker ★★★: the skilled one**: stepStalker, botElementFor, botShop, botShopPass

## shared/engine.js (473 lines)

- BOT_NAMES, normName, createEngine, playerCount, botName, freeAvatar, maybeAutoStart, resetToLobby, scheduleLobbyReset, cancelLobbyReset

## shared/constants.js (933 lines)

- TICK_RATE, SNAPSHOT_RATE, ARENA, PLAYER, LAVA, ROUND, TEAMS, teamTint, MULTIKILL_NAMES, AVATARS, GOLD
- **Spells**: SPELLS
- **Items (passive, 3 LEVELS each)**: ITEMS, itemCost, ITEM_FX
- **Elements (elemental mode only)**: STACK_DECAY, ELEMENTS
- **Draft mode (round 12): optional lobby toggle, OFF by default**: DRAFT, COLORS
- **Bots: roster contract; behavior lives in shared/sim.js (stepBot)**: BOTS, BOT_MEMORY, BOT_TARGETING
- **CC-gated casting (round 20: Remi's frost+gale+mosquito combo)**: BOT_CC_CAST
- **Bot build strategies**: BUILDS

## shared/items.js (59 lines)

- itemFxAt, itemBonuses, itemFxDelta

## shared/catalogue.js (80 lines)

- STARTING_KIT, catalogue, draftable, kindOf, ownedLevel

## shared/campaign.js (419 lines)

- **what the ITEM-CAP repair of 2026-08-07 (later) learned**: TEAM, ENEMY_COLOR, SCALE
- **the 10 levels**: CAMPAIGN
- **retuned 2026-08-07 (item-cap repair)**: MAX_LEVEL, levelFor, waveUnits, levelRoster

## shared/snapdelta.js (104 lines)

- diff, patch, createSnapEncoder, createSnapDecoder

## shared/snapwire.js (207 lines)

- QUEUE_LIMIT_SNAPS, QUEUE_FLOOR_BYTES, ACK_LIMIT_SNAPS, createSnapWire, createSnapSink

## client/main.js (2311 lines)

- **key bindings (rebindable, persisted)**: loadKeys, saveKeys, spellForKey, keyLabel
- **state**: me, latest
- **error surfacing**: reportError, setConnBanner
- **networking**: wireTransport, connect, onMessage, scheduleReconnect, send, pushFloater, onEvent
- **phase-driven sounds**: phaseSounds
- **phase-driven music**: phaseMusic
- **interpolation**: trackSnapGap, interpolated
- **input**: toWorld
- **join / lobby / shop DOM**: doJoin
- **hosting online (docs/BRIEF-browser-hosting.md §B3)**: inviteLink, showHostbar, copyInviteLink, doHost
- **key bindings panel**: startCapture, cancelCapture, onCaptureClick, onCaptureKey, applyPreset, closeKeysPanel
- **rebinding: ONE rule, both entry points**: bindKey, openRebind, closeRebind, onRebindKey, refreshKeyUi, setShopPreview, toast
- **shop numbers**: fmtNum, fmtMult, tipRow, orderedFields, tipHead, tipShell, spellTip, elementTip, itemTip
- **hover tooltip**: placeTip, showTip, hideTip, refreshTip, attachTip, buildShop, drawDraftBanner, thingSpec, thingName, thingDesc, thingIcon, thingCost
- **DOM update per phase**: setVisible, paintScoreboard
- **versus teams (round 21.3)**: kitIcons, pingBadge, statsTable, updateUi, esc
- **main loop**: frame

## client/render.js (1555 lines)

- makeView, drawEngorged, draw
- **fx**: drawBackdrop, drawWorldDone, drawBanners, drawRoundEndBanner, drawFx

## client/transport.js (495 lines)

- createWsTransport, createInTabEngine, createLocalTransport, ensureEngine
- **WebRTC hosting (docs/BRIEF-browser-hosting.md §B)**: SIGNAL_URL, signalUrl, roomCodeFromHash, createRtcHostTransport, ensureEngine, sendTo, dropPeer, onPeer, onSig, dialSignal, createRtcGuestTransport, dropped, wireCtrl, dial, onSig, selectTransport

## server/index.js (352 lines)

- journal, crashDump

## version-sw.js (126 lines)

- versionFile, readManifest, loadValidCommits, mimeType

## version-menu.js (189 lines)

- loadVstats, openOverlay, close, render, loadManifest, addJoinPicker, isCurrent, versionUrl, switchVersion, escapeHtml, escapeAttr
