import type { FieldSpec, PlayerAttributes, Team } from '../types';

export const FIELD_HOME_ID = 'field-rooftop-breeze';

export const DEMO_FIELDS: FieldSpec[] = [
  {
    id: FIELD_HOME_ID,
    name: '晨风屋顶场',
    description: '基础半场。边角有低矮广告牌，适合练习直线切出与传接节奏。',
    width: 680,
    height: 430,
    endzoneDepth: 70,
    obstacles: [
      { id: 'ob-home-left', x: 72, y: 112, w: 24, h: 78, angle: 0.04, kind: 'crate', label: '广告牌' },
      { id: 'ob-home-right', x: 535, y: 285, w: 28, h: 110, angle: -0.08, kind: 'crate', label: '设备箱' }
    ],
    windZones: [],
    globalWind: { angle: -Math.PI / 2, strength: 8 },
    unlockPoints: 0,
    builtIn: true
  },
  {
    id: 'field-urban-cages',
    name: '城市铁笼场',
    description: '两侧看台压缩横移空间，中路偶尔有下沉乱流。',
    width: 680,
    height: 430,
    endzoneDepth: 70,
    obstacles: [
      { id: 'ob-stand-l', x: 38, y: 230, w: 34, h: 250, angle: 0, kind: 'stand', label: '左侧看台' },
      { id: 'ob-stand-r', x: 642, y: 230, w: 34, h: 250, angle: 0, kind: 'stand', label: '右侧看台' },
      { id: 'ob-cage-mid', x: 350, y: 178, w: 96, h: 22, angle: 0.16, kind: 'crate', label: '临时围栏' }
    ],
    windZones: [
      { id: 'wz-cage-gust', x: 235, y: 110, w: 210, h: 115, angle: Math.PI / 2, strength: 28 }
    ],
    globalWind: { angle: 0, strength: 12 },
    unlockPoints: 1,
    builtIn: true
  },
  {
    id: 'field-riverside',
    name: '河岸交叉风场',
    description: '河风从右向左切过前场，树下路线必须绕开低枝。',
    width: 680,
    height: 430,
    endzoneDepth: 70,
    obstacles: [
      { id: 'ob-tree-l', x: 185, y: 135, w: 72, h: 72, angle: 0, kind: 'tree', label: '行道树' },
      { id: 'ob-tree-r', x: 505, y: 105, w: 62, h: 62, angle: 0, kind: 'tree', label: '行道树' },
      { id: 'ob-net', x: 342, y: 315, w: 145, h: 18, angle: -0.1, kind: 'net', label: '防护网' }
    ],
    windZones: [
      { id: 'wz-cross', x: 70, y: 50, w: 540, h: 205, angle: Math.PI, strength: 30 },
      { id: 'wz-corner', x: 520, y: 260, w: 130, h: 120, angle: -Math.PI / 2, strength: 20 }
    ],
    globalWind: { angle: Math.PI, strength: 14 },
    unlockPoints: 2,
    builtIn: true
  },
  {
    id: 'field-night-bowl',
    name: '夜光环碗场',
    description: '强烈场地风与中央网架制造高风险长传，冷静短传反而有效。',
    width: 680,
    height: 430,
    endzoneDepth: 70,
    obstacles: [
      { id: 'ob-bowl-net', x: 340, y: 185, w: 36, h: 178, angle: 0.02, kind: 'net', label: '中央网架' },
      { id: 'ob-bowl-l', x: 95, y: 350, w: 130, h: 28, angle: 0.25, kind: 'stand', label: '台阶' },
      { id: 'ob-bowl-r', x: 585, y: 350, w: 130, h: 28, angle: -0.25, kind: 'stand', label: '台阶' }
    ],
    windZones: [
      { id: 'wz-left-vortex', x: 80, y: 80, w: 190, h: 190, angle: Math.PI * 0.8, strength: 34 },
      { id: 'wz-right-vortex', x: 410, y: 80, w: 190, h: 190, angle: -Math.PI * 0.8, strength: 34 }
    ],
    globalWind: { angle: Math.PI / 2, strength: 18 },
    unlockPoints: 4,
    builtIn: true
  }
];

export const HOME_TEAM: Team = {
  id: 'home-aerial',
  name: '破风者',
  abbr: 'AER',
  color: 0x2dd4bf,
  secondary: 0x0f172a,
  rating: 3,
  style: '路线执行 / 短传推进',
  players: [
    {
      id: 'home-lin',
      name: '林澈',
      role: 'handler',
      speed: 6,
      stamina: 8,
      catching: 8,
      defense: 5,
      release: 9,
      unlockPoints: 0,
      color: 0x2dd4bf,
      bio: '冷静的主传手，擅长在停顿后重新选择短传。'
    },
    {
      id: 'home-miao',
      name: '苗星',
      role: 'cutter',
      speed: 9,
      stamina: 6,
      catching: 7,
      defense: 5,
      release: 5,
      unlockPoints: 0,
      color: 0x67e8f9,
      bio: '爆发很强，但连续冲刺后需要慢跑恢复。'
    },
    {
      id: 'home-ahu',
      name: '阿虎',
      role: 'cutter',
      speed: 7,
      stamina: 8,
      catching: 7,
      defense: 6,
      release: 4,
      unlockPoints: 0,
      color: 0x86efac,
      bio: '稳定的纵深切入手，适合绕开中路障碍。'
    },
    {
      id: 'home-qiao',
      name: '乔十一',
      role: 'hybrid',
      speed: 6,
      stamina: 7,
      catching: 7,
      defense: 8,
      release: 6,
      unlockPoints: 0,
      color: 0xfde047,
      bio: '防守判断优秀，也能作为第二接应点。'
    },
    {
      id: 'home-nian',
      name: '念安',
      role: 'handler',
      speed: 5,
      stamina: 7,
      catching: 8,
      defense: 6,
      release: 8,
      unlockPoints: 0,
      color: 0xc4b5fd,
      bio: '可靠的复位传手，适合安全传接。'
    },
    {
      id: 'home-yu',
      name: '余闪',
      role: 'cutter',
      speed: 10,
      stamina: 6,
      catching: 8,
      defense: 5,
      release: 4,
      unlockPoints: 2,
      color: 0xfca5a5,
      bio: '城市赛中最快的新人，能用一次冲刺改变防线。'
    },
    {
      id: 'home-mira',
      name: '米拉',
      role: 'handler',
      speed: 6,
      stamina: 8,
      catching: 9,
      defense: 6,
      release: 10,
      unlockPoints: 4,
      color: 0xf0abfc,
      bio: '高弧线与逆风短传大师，关键时刻出手稳定。'
    },
    {
      id: 'home-shan',
      name: '山岚',
      role: 'hybrid',
      speed: 7,
      stamina: 9,
      catching: 8,
      defense: 10,
      release: 6,
      unlockPoints: 6,
      color: 0xfdba74,
      bio: '覆盖面积巨大的防守核心，能追近飞行中的盘。'
    }
  ]
};

function team(
  id: string,
  name: string,
  abbr: string,
  color: number,
  rating: number,
  style: string,
  names: Array<[string, PlayerAttributes['role'], number[]]>,
  secondary = 0x111827
): Team {
  const players: PlayerAttributes[] = names.map(([name, role, stats], i) => ({
    id: `${id}-p${i + 1}`,
    name,
    role,
    speed: stats[0],
    stamina: stats[1],
    catching: stats[2],
    defense: stats[3],
    release: stats[4],
    unlockPoints: 0,
    color,
    bio: `${name} 是${name}队的${role === 'handler' ? '传手' : role === 'cutter' ? '切入手' : '全能队员'}。`
  }));
  return { id, name, abbr, color, secondary, rating, style, players };
}

export const DEMO_TEAMS: Team[] = [
  team('opp-dawn', '晨光学院', 'DWN', 0xf59e0b, 2, '慢热区域轮转', [
    ['周明', 'handler', [5, 7, 6, 5, 6]],
    ['许青', 'cutter', [6, 6, 6, 4, 4]],
    ['高岩', 'cutter', [6, 7, 5, 6, 4]],
    ['韩梅', 'hybrid', [5, 6, 6, 6, 5]],
    ['陆远', 'handler', [5, 6, 6, 5, 7]]
  ]),
  team('opp-kestrel', '红隼竞技', 'KES', 0xef4444, 3, '紧逼人盯人', [
    ['红羽', 'handler', [6, 6, 7, 6, 7]],
    ['疾风', 'cutter', [8, 6, 6, 7, 4]],
    ['肖刃', 'cutter', [7, 6, 7, 7, 4]],
    ['祁望', 'hybrid', [6, 7, 6, 8, 5]],
    ['白柠', 'handler', [6, 7, 7, 6, 7]]
  ]),
  team('opp-ironnet', '铁网联队', 'IRN', 0x94a3b8, 5, '高压拦截', [
    ['铁梁', 'handler', [6, 8, 7, 7, 7]],
    ['封线', 'cutter', [7, 8, 7, 8, 5]],
    ['唐截', 'cutter', [8, 7, 7, 9, 4]],
    ['闻笛', 'hybrid', [7, 8, 7, 8, 6]],
    ['沈栅', 'handler', [6, 8, 8, 7, 8]]
  ], 0x0f172a),
  team('opp-nightcruise', '夜空巡航', 'NCR', 0x8b5cf6, 7, '风场阅读 / 反跑', [
    ['夜枢', 'handler', [7, 8, 9, 7, 9]],
    ['星阱', 'cutter', [9, 8, 8, 8, 5]],
    ['蓝潮', 'cutter', [8, 9, 8, 8, 5]],
    ['静默', 'hybrid', [8, 9, 9, 9, 7]],
    ['环轨', 'handler', [7, 9, 9, 8, 9]]
  ], 0x1e1b4b)
];

export const TEAM_MAP: Record<string, Team> = Object.fromEntries(
  [HOME_TEAM, ...DEMO_TEAMS].map((t) => [t.id, t])
);

export const FIELD_MAP: Record<string, FieldSpec> = Object.fromEntries(
  DEMO_FIELDS.map((f) => [f.id, f])
);
