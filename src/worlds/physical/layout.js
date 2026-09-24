// Shared layout numbers. Kept in their own module so content-side files
// (glossary.js) can use them without importing the whole 3D world.

// The receiver's side sits this far east of where it used to be, which
// leaves room for an ocean between Alice's town and the data centre.
export const RX = 110;

// Anything west of this x belongs to the sender's side, east of it to the
// receiver's side.
export const NET_MID = 76;
