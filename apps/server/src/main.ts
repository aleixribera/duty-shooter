import { Simulation, TICK_RATE, createWorld } from '@duty-shooter/fps-core';

// Stub: proves the server can bundle and run fps-core. The authoritative
// server (ws transport, passphrase, player cap) arrives with the netcode tickets.
const simulation = new Simulation(createWorld([]));
simulation.step();
console.log(`duty-shooter server stub: fps-core loaded, ${TICK_RATE} Hz, tick ${simulation.tick}`);
