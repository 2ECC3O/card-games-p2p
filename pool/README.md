# Eight-Ball Pool

Play [eight-ball](https://www.wpapool.com/wp-content/uploads/2026/01/2026.01.02-WPA-Rules.pdf) in a browser room. Singles seat two players; Scotch doubles seats four. Start with fewer people and the host fills empty seats with built-in bots. There is no downloaded bot or physics library.

## Playing

Create or join a room and share the code. The host chooses singles or doubles and a race to 1, 3, or 5 racks. Watch joins without a seat; naming a watch browser **TOURNAMENT** adds the room QR, score board and action feed. The host browser runs the match and needs to remain online; another connected player can take over if it leaves.

Drag on the table to aim (a tap aims too). Fine-angle buttons move the cue by 1° or 0.2°. Set the power, tap the big cue ball to pick where to strike it (centre, top for follow, bottom for draw, left or right for side spin), then **Shoot**. The guide runs the real physics: a dashed line for the cue ball's path to its first contact, including cushion bounces, then short lines for where the cue ball and the ball it hits go next. For a non-break shot, tap a ball and a pocket to call it (or use the menus), or declare a safety. Ball in hand lets you tap a free spot; on the break, the spot must be behind the head string.

Every browser watches each shot roll out: the host sends the shot's inputs and each screen replays it with the same deterministic physics, so the balls end exactly where the host says. Each shot or break decision has a **90-second shot clock**, counted from when the balls stop. Running out is a foul: the other side gets ball in hand (behind the head string if it was the break), and a pending break decision takes its default.

The rack follows the main [WPA eight-ball rules](https://www.wpapool.com/wp-content/uploads/2026/01/2026.01.02-WPA-Rules.pdf): the 8 racked in the middle with a solid and a stripe in the back corners, legal break, open table until a called shot assigns solids or stripes, correct first contact, a rail or pocket after contact, ball in hand after a standard foul, and rack loss for an early or wrongly pocketed eight. Break choices are presented when a break is illegal or the eight falls on the break. Doubles uses [WPA Scotch doubles](https://wpapool.com/wp-content/uploads/2025/09/2025.09.15-WPA-Regs.pdf): teammates alternate shots, including when the team stays at the table.

The physics is a 2D model with sliding and rolling friction, so stun, draw and follow come out naturally, plus side spin off the cushions and pocket mouths with jaws. It does not model throw, squirt, swerve, jump or masse shots, frozen-ball declarations, a referee's judgment about a deliberate foul, or every tournament break option. The host's result is authoritative. Bots test their best-looking pots in the simulator, keep the one that goes in and leaves a clear next shot, play a safety when nothing is on, and miss their line and power a little (`BOT_AIM_ERROR` and `BOT_POWER_ERROR` in `poolEngine.ts`), making about half their called pots. Before each shot a bot shows its aim, target and power for 2.5 seconds (`BOT_AIM_MS`). The watch display's live **rack outlook** is an uncalibrated estimate from balls cleared and whose turn it is; **past rack win rate** is completed racks won divided by completed racks. Neither is a real-world winning probability.

## Local development

Requires Node.js 20.19 or newer. Run `npm ci`, `npm test`, and `npm run build` in this folder. `npm run dev` starts Vite. Like the other games, publishing occurs through the root GitHub Pages workflow.
