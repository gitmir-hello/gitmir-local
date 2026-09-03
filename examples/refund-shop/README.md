# refund-shop — a project to try the dashboard on

A tiny invented shop: orders, payments, a catalog. Nothing here is real code — it is a
few source files and three tasks, which is enough to see how the queue works before you
point the tool at your own repository.

Add this folder as a project and the board has something to show: what is planned, what
is in flight, what was finished, and what each task says it will touch.

The interesting one is **`tasks/todo/010-partial-refund.md`**. It carries a `Touches:`
line — the handles of the parts of the product it will change. A handle is issued by the
laboratory and looks like `gm_` and ten characters. It points at something and says
nothing else about it: not its kind, not its neighbours, not where it sits. That is why a
task file can live in a public repository without publishing how the product is arranged.

What the handles are worth depends on where you are:

- **Without a laboratory** they are opaque labels. The board still shows the queue, the
  order of the work and what each task declares — which is most of what a queue is for.
- **With a laboratory connected** they resolve: what each one is, what depends on it, and
  how far this task would actually reach compared to what its ticket admits. That gap —
  between what somebody named and what it really touches — is the thing worth paying for,
  and it is the one thing a queue on its own cannot tell you.

`tasks/done/005-refund-endpoint.md` is there so the board is not empty on the right-hand
side, and `020-catalog-sort.md` is deliberately dull: not every task is interesting, and a
demo where every card is dramatic teaches the wrong thing.
