// Block ids stored in the voxel grid, and which atlas tile each face uses.

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLE: 4,
  SAND: 5,
  LOG: 6,
  LEAVES: 7,
  LEAVES_DARK: 8,
  PLANKS: 9,
  BRICKS: 10,
  RED_SAND: 11,
  TERRA_ORANGE: 12,
  TERRA_WHITE: 13,
  TERRA_BROWN: 14,
  TERRA_RED: 15,
  TERRA_YELLOW: 16,
  SNOW: 17,
  GRAVEL: 18,
  OBSIDIAN: 19,
  LAMP: 20,
  CACTUS: 21,
  TILE_APP: 22,
  TILE_TRANSPORT: 23,
  TILE_INTERNET: 24,
  TILE_LINK: 25,
  LAMP_APP: 26,
  LAMP_TRANSPORT: 27,
  LAMP_INTERNET: 28,
  LAMP_LINK: 29,
  // Invisible but solid: gives props like the laptop a collision volume.
  BARRIER: 255,
};

export const LAYER_TILE = { app: B.TILE_APP, transport: B.TILE_TRANSPORT, internet: B.TILE_INTERNET, link: B.TILE_LINK };
export const LAYER_LAMP = { app: B.LAMP_APP, transport: B.LAMP_TRANSPORT, internet: B.LAMP_INTERNET, link: B.LAMP_LINK };

const all = (t) => ({ top: t, side: t, bottom: t });

export const BLOCKS = {
  [B.GRASS]: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' },
  [B.DIRT]: all('dirt'),
  [B.STONE]: all('stone'),
  [B.COBBLE]: all('cobble'),
  [B.SAND]: all('sand'),
  [B.LOG]: { top: 'log_top', side: 'log_side', bottom: 'log_top' },
  [B.LEAVES]: all('leaves'),
  [B.LEAVES_DARK]: all('leaves_dark'),
  [B.PLANKS]: all('planks'),
  [B.BRICKS]: all('bricks'),
  [B.RED_SAND]: all('red_sand'),
  [B.TERRA_ORANGE]: all('terra_orange'),
  [B.TERRA_WHITE]: all('terra_white'),
  [B.TERRA_BROWN]: all('terra_brown'),
  [B.TERRA_RED]: all('terra_red'),
  [B.TERRA_YELLOW]: all('terra_yellow'),
  [B.SNOW]: { top: 'snow', side: 'snow_side', bottom: 'stone' },
  [B.GRAVEL]: all('gravel'),
  [B.OBSIDIAN]: all('obsidian'),
  [B.LAMP]: { ...all('lamp'), glow: true },
  [B.CACTUS]: { top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top' },
  [B.TILE_APP]: all('tile_app'),
  [B.TILE_TRANSPORT]: all('tile_transport'),
  [B.TILE_INTERNET]: all('tile_internet'),
  [B.TILE_LINK]: all('tile_link'),
  [B.LAMP_APP]: { ...all('lamp_app'), glow: true },
  [B.LAMP_TRANSPORT]: { ...all('lamp_transport'), glow: true },
  [B.LAMP_INTERNET]: { ...all('lamp_internet'), glow: true },
  [B.LAMP_LINK]: { ...all('lamp_link'), glow: true },
};

export const isOpaque = (id) => id !== B.AIR && id !== B.BARRIER;
