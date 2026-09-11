import Phaser from 'phaser';
import type { FieldSpec } from './types';
import { currentPlanFor, getPlayableFixture, useAppStore } from './store/useAppStore';
import { createGame } from './game/createGame';
import { DEMO_FIELDS, DEMO_TEAMS, FIELD_MAP, HOME_TEAM, TEAM_MAP } from './data/gameData';
import { describeWind } from './game/geometry';
import { GAME_SCENE_SCREENS, isGameSceneScreen, shouldRestartScenes } from './game/sceneRouting';
import { playSfx, setMuted, unlockAudio } from './audio';

let game: Phaser.Game | undefined;
let renderedScreen: string | undefined;

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function getField(id: string, custom: FieldSpec[]): FieldSpec {
  return FIELD_MAP[id] ?? custom.find((f) => f.id === id) ?? DEMO_FIELDS[0];
}

function stopAllGameScenes() {
  if (!game) return;
  for (const key of GAME_SCENE_SCREENS) game.scene.stop(key);
}

function startScene(screen: string, state: ReturnType<typeof useAppStore.getState>) {
  if (!game) return;
  if (!isGameSceneScreen(screen)) return;
  const field = getField(state.selectedFieldId, state.customFields);
  if (screen === 'plan') {
    const fieldId = state.planSession?.fieldId ?? state.selectedFieldId;
    game.scene.start('plan', { field: getField(fieldId, state.customFields) });
  }
  if (screen === 'fieldEditor') {
    game.scene.start('fieldEditor', { field });
  }
  if (screen === 'match') {
    const playable = getPlayableFixture(state.season);
    if (!playable) {
      state.setScreen('seasonComplete');
      return;
    }
    const { fixture } = playable;
    const awayTeam = TEAM_MAP[fixture.opponentId] ?? DEMO_TEAMS[0];
    const unlockedFixtureField = state.unlockedFieldIds.includes(fixture.fieldId);
    const matchField = unlockedFixtureField ? getField(fixture.fieldId, state.customFields) : field;
    const plan = currentPlanFor(matchField, state.starterIds, state.plans[matchField.id]);
    game.scene.start('match', {
      field: matchField,
      awayTeam,
      seed: Date.now() % 2_000_000_000,
      plan
    });
  }
  if (screen === 'replay' && state.lastReplay) {
    game.scene.start('replay', { field: state.lastReplay.field, replay: state.lastReplay });
  }
}

function render(app: HTMLDivElement) {
  const state = useAppStore.getState();
  const screenTitle: Record<string, string> = {
    menu: '风盘战术',
    season: '单机赛季',
    roster: '队员与解锁',
    fields: '半场与风场',
    plan: '赛前路线',
    match: '比赛中',
    replay: '回放分析',
    seasonComplete: '赛季总结'
  };
  app.innerHTML = `
    <aside class="sidebar panel">
      <div class="brand"><span class="logo">◜◝</span><div><h1>${screenTitle[state.screen]}</h1><p>Aerial Timeout · 半场飞盘战术</p></div></div>
      <nav>
        ${navButton('menu', '主页')}
        ${navButton('season', '赛季赛程')}
        ${navButton('roster', '队员阵容')}
        ${navButton('fields', '球场 / 风场')}
        ${navButton('plan', '绘制路线')}
      </nav>
      <div class="season-mini">
        <span>赛季积分</span><b>${state.season.points}</b>
        <span>第 ${Math.min(state.currentMatchday, state.season.totalMatchdays)} / ${state.season.totalMatchdays} 轮</span>
      </div>
      <button class="small" data-action="mute">${state.muted ? '🔇 音效关' : '🔊 音效开'}</button>
      <button class="small danger" data-action="reset">清空存档</button>
    </aside>
    <main id="screen-content" class="screen ${state.screen}"></main>
  `;

  const content = app.querySelector<HTMLDivElement>('#screen-content')!;
  switch (state.screen) {
    case 'menu': renderMenu(content); break;
    case 'season': renderSeason(content); break;
    case 'roster': renderRoster(content); break;
    case 'fields': renderFields(content); break;
    case 'plan': content.innerHTML = '<div class="canvas-note">在右侧球场上绘制路线。若没看到球场，请稍等 WebGL 初始化。</div>'; break;
    case 'match': content.innerHTML = '<div class="canvas-note">比赛进行中：空格或按钮可使用有限暂停。</div>'; break;
    case 'replay': content.innerHTML = '<div class="canvas-note">正在载入回放时间轴。</div>'; break;
    case 'seasonComplete': renderComplete(content); break;
  }

  const previousScreen = renderedScreen;
  renderedScreen = state.screen;
  if (shouldRestartScenes(previousScreen, state.screen)) {
    stopAllGameScenes();
    if (game && isGameSceneScreen(state.screen)) startScene(state.screen, state);
  }
  setMuted(state.muted);
}

function navButton(screen: string, label: string): string {
  const active = useAppStore.getState().screen === screen ? 'active' : '';
  return `<button class="${active}" data-nav="${screen}">${label}</button>`;
}

function globalClick(event: MouseEvent) {
  unlockAudio();
  const target = (event.target as HTMLElement).closest('[data-nav],[data-action]') as HTMLElement | null;
  if (!target) return;
  playSfx('click');
  const state = useAppStore.getState();
  const nav = target.getAttribute('data-nav');
  const action = target.getAttribute('data-action');
  if (nav) state.setScreen(nav as never);
  if (action === 'mute') state.setMuted(!state.muted);
  if (action === 'reset' && confirm('确定清空本机存档并重新开始？')) state.resetAll();
}

function renderMenu(root: HTMLElement) {
  const state = useAppStore.getState();
  root.innerHTML = `
    <section class="hero panel">
      <div>
        <p class="eyebrow">Phaser 3 · Matter.js · TypeScript</p>
        <h2>你不直接跑位，你负责设计跑位。</h2>
        <p>开赛前画路线、设定传接节点；比赛中只有 ${2} 次暂停。风向、体力、盯防和拦截会让同一套战术产生不同结果。失误后用回放定位问题，再改方案打下一场。</p>
        <div class="row gap">
          <button class="primary big" data-action="continue">${state.season.fixtures.some(f => f.played) ? '继续赛季' : '开始新赛季'}</button>
          <button class="big" data-nav="plan">先画路线</button>
        </div>
      </div>
      <div class="wind-card"><b>${describeWind(getField(state.selectedFieldId, state.customFields).globalWind)}</b><span>当前主场</span></div>
    </section>
    <section class="feature-grid">
      ${feature('半场 / 风场', '实体障碍会阻止路线通过，局部风区推动飞盘轨迹。')}
      ${feature('有限暂停', '比赛中观察防守，暂停后只能做少量临场修正。')}
      ${feature('体力与拦截', '冲刺消耗体力，低体力降速；防守会追盘并概率断盘。')}
      ${feature('节点回放', '得分、接球、脱手、出界和撞障都会标在时间轴。')}
    </section>
  `;
  root.querySelector('[data-action="continue"]')?.addEventListener('click', () => {
    if (!useAppStore.getState().season.fixtures.some((f) => f.played)) useAppStore.getState().startNewSeason();
    useAppStore.getState().setScreen('season');
  });
}

function feature(title: string, text: string): string {
  return `<article class="panel feature"><h3>${title}</h3><p>${text}</p></article>`;
}

function renderSeason(root: HTMLElement) {
  const state = useAppStore.getState();
  const field = getField(state.selectedFieldId, state.customFields);
  const playable = getPlayableFixture(state.season);
  const nextButton = playable
    ? `<button class="primary" data-action="start-match">进入第 ${playable.matchday} 轮</button>`
    : '<button class="primary" data-action="view-summary">查看赛季总结</button>';
  root.innerHTML = `
    <div class="panel stack">
      <div class="between"><h2>四场演示赛季</h2>${nextButton}</div>
      <p class="muted">胜利 3 分，平局 1 分，失利 0 分。积分会自动解锁新队员和新球场。${playable ? '' : ' 四场比赛均已完成，可查看总结或开启新赛季。'}</p>
      <div class="fixtures">
        ${state.season.fixtures.map((fixture) => {
          const team = TEAM_MAP[fixture.opponentId]!;
          const current = playable?.matchday === fixture.matchday;
          return `<article class="fixture ${current ? 'current' : ''} ${fixture.played ? 'played' : ''}">
            <span>第 ${fixture.matchday} 轮</span>
            <b style="color:${hex(team.color)}">${team.name}</b>
            <small>${team.style} · 强度 ${team.rating}</small>
            <p>${fixture.played ? `${fixture.scoreFor}:${fixture.scoreAgainst} · ${fixture.points} 分` : current ? '下一场' : '未解锁'}</p>
          </article>`;
        }).join('')}
      </div>
      <div class="row gap wrap">
        <button data-nav="plan">检查 / 修改路线</button>
        <button data-nav="fields">当前球场：${field.name}</button>
        <button data-nav="roster">调整 5 人上场名单</button>
      </div>
    </div>
  `;
  root.querySelector('[data-action="start-match"]')?.addEventListener('click', () => {
    if (getPlayableFixture(useAppStore.getState().season)) useAppStore.getState().setScreen('match');
  });
  root.querySelector('[data-action="view-summary"]')?.addEventListener('click', () => {
    useAppStore.getState().setScreen('seasonComplete');
  });
}

function renderRoster(root: HTMLElement) {
  const state = useAppStore.getState();
  const unlocked = new Set(state.unlockedPlayerIds);
  root.innerHTML = `
    <div class="panel stack">
      <h2>破风者阵容</h2>
      <p class="muted">点亮队员为上场五人。新队员需要赛季积分达到要求；体力低的队员连续冲刺会在比赛后半段降速。</p>
      <div class="player-grid">
        ${HOME_TEAM.players.map((p) => {
          const owned = unlocked.has(p.id);
          const starter = state.starterIds.includes(p.id);
          return `<article class="player-card ${owned ? '' : 'locked'} ${starter ? 'starter' : ''}" data-player="${p.id}">
            <div class="avatar" style="background:${hex(p.color)}">${p.name.slice(0, 1)}</div>
            <h3>${p.name} ${owned ? '' : '🔒'}</h3><small>${roleName(p.role)}</small>
            <p>${p.bio}</p>
            <div class="stats">${stat('速度', p.speed)}${stat('体力', p.stamina)}${stat('接球', p.catching)}${stat('防守', p.defense)}${stat('出手', p.release)}</div>
            <b>${owned ? (starter ? '上场中' : '替补 / 点击上场') : `需要 ${p.unlockPoints} 积分`}</b>
          </article>`;
        }).join('')}
      </div>
    </div>
  `;
  root.querySelectorAll<HTMLElement>('.player-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.player!;
      const owned = unlocked.has(id);
      if (!owned) {
        state.togglePlayerUnlock(id);
        return;
      }
      let ids = state.starterIds;
      if (ids.includes(id)) ids = ids.filter((s) => s !== id);
      else if (ids.length < 5) ids = [...ids, id];
      else ids = [...ids.slice(1), id];
      while (ids.length < 5) {
        const next = HOME_TEAM.players.find((p) => unlocked.has(p.id) && !ids.includes(p.id));
        if (!next) break;
        ids = [...ids, next.id];
      }
      state.setStarters(ids);
    });
  });
}

function roleName(role: string): string {
  return role === 'handler' ? '传手' : role === 'cutter' ? '切入手' : '全能';
}
function stat(label: string, value: number): string {
  return `<div><span>${label}</span><meter min="1" max="10" value="${value}"></meter><b>${value}</b></div>`;
}

function renderFields(root: HTMLElement) {
  const state = useAppStore.getState();
  const all = [...DEMO_FIELDS, ...state.customFields];
  root.innerHTML = `
    <div class="panel stack">
      <div class="between"><h2>选择半场</h2><button class="primary" data-action="new-field">新建 / 复制球场</button></div>
      <div class="field-grid">
        ${all.map((f) => {
          const unlocked = state.unlockedFieldIds.includes(f.id) || !f.builtIn;
          const selected = state.selectedFieldId === f.id;
          return `<article class="field-card ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-field="${f.id}">
            <h3>${f.name}${selected ? ' ✓' : ''}</h3><p>${f.description}</p>
            <div class="field-meta"><span>${describeWind(f.globalWind)}</span><span>${f.obstacles.length} 障碍</span><span>${f.windZones.length} 风区</span></div>
            <b>${unlocked ? (selected ? '当前主场' : '点击选用') : `需要 ${f.unlockPoints} 积分`}</b>
          </article>`;
        }).join('')}
      </div>
    </div>
  `;
  root.querySelector('[data-action="new-field"]')?.addEventListener('click', () => {
    playSfx('click');
    useAppStore.getState().setScreen('fieldEditor');
  });
  root.querySelectorAll<HTMLElement>('.field-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.field!;
      const field = all.find(f => f.id === id)!;
      const unlocked = state.unlockedFieldIds.includes(id) || !field.builtIn;
      if (unlocked) state.selectField(id);
    });
  });
}

function renderComplete(root: HTMLElement) {
  const state = useAppStore.getState();
  root.innerHTML = `
    <div class="panel stack center">
      <h2>赛季结束</h2>
      <div class="trophy">${state.season.points >= 9 ? '🏆' : '🧭'}</div>
      <p>总积分 <b>${state.season.points}</b>，总得失分 ${state.season.scoreFor}:${state.season.scoreAgainst}</p>
      <p class="muted">${state.season.points >= 9 ? '你已经掌握风场阅读与暂停修改。' : '回到路线与回放，减少长传和连续冲刺，再挑战一次。'}</p>
      <div class="row gap"><button class="primary" data-action="new">开启新赛季</button><button data-nav="roster">查看解锁</button></div>
    </div>
  `;
  root.querySelector('[data-action="new"]')?.addEventListener('click', () => {
    state.startNewSeason();
    state.setScreen('season');
  });
}

export function mountApp(app: HTMLDivElement, gameRoot: HTMLElement): void {
  game = createGame(gameRoot);
  document.body.addEventListener('click', globalClick);
  useAppStore.subscribe(() => render(app));
  render(app);
}
