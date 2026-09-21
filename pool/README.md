# Eight-Ball Pool

Play [eight-ball](https://www.wpapool.com/wp-content/uploads/2026/01/2026.01.02-WPA-Rules.pdf) in a browser room. Singles seat two players; Scotch doubles seats four. Start with fewer people and the host fills empty seats with built-in bots. There is no downloaded bot or physics library.

## Playing

Create or join a room and share the code. The host chooses singles or doubles and a race to 1, 3, or 5 racks. Watch joins without a seat; naming a watch browser **TOURNAMENT** adds the room QR, score board and action feed. The host browser runs the match and needs to remain online; another connected player can take over if it leaves.

Tap the table to aim. Fine-angle buttons move the cue by 1° or 0.2°. Set power, left/right tip position and top/bottom tip position, then **Shoot**. The dashed guide shows the first predicted contact along a straight cue path; it does not predict every rebound or spin effect. For a non-break shot, call a ball and pocket or declare a safety. Ball in hand lets you tap a free spot; on the break, the spot must be behind the head string.

The rack follows the main [WPA eight-ball rules](https://www.wpapool.com/wp-content/uploads/2026/01/2026.01.02-WPA-Rules.pdf): legal break, open table until a called shot assigns solids or stripes, correct first contact, a rail or pocket after contact, ball in hand after a standard foul, and rack loss for an early or wrongly pocketed eight. Break choices are presented when a break is illegal or the eight falls on the break. Doubles uses [WPA Scotch doubles](https://wpapool.com/wp-content/uploads/2025/09/2025.09.15-WPA-Regs.pdf): teammates alternate shots, including when the team stays at the table.

This is a lightweight 2D simulation, not a full billiards referee. It does not model jump or masse shots, frozen-ball declarations, a referee's judgment about a deliberate foul, or every tournament break option. The host's result is authoritative. Bot aiming is a simple direct-shot heuristic. The watch display's live **rack outlook** is an uncalibrated estimate from balls cleared and whose turn it is; **past rack win rate** is completed racks won divided by completed racks. Neither is a real-world winning probability.

## Local development

Requires Node.js 20.19 or newer. Run `npm ci`, `npm test`, and `npm run build` in this folder. `npm run dev` starts Vite. Like the other games, publishing occurs through the root GitHub Pages workflow.
