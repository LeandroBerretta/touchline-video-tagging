// A stand-in for Vimeo's player.js: the test controls the clock. Seeking resolves and then fires
// "seeked"; advance() moves the time forward in small steps and fires "timeupdate" like the real player.

export function installFakeVimeo(window, { duration = 5400 } = {}) {
  const players = [];

  class FakePlayer {
    constructor(element) {
      this.element = element;
      this.time = 0;
      this.duration = duration;
      this.paused = true;
      this.destroyed = false;
      this.handlers = {};
      players.push(this);
    }
    on(event, handler) {
      (this.handlers[event] ??= []).push(handler);
    }
    emit(event, data) {
      for (const handler of this.handlers[event] || []) handler(data);
    }
    async ready() {}
    async getDuration() { return this.duration; }
    async getCurrentTime() { return this.time; }
    async getPaused() { return this.paused; }
    async setCurrentTime(seconds) {
      this.time = seconds;
      queueMicrotask(() => this.emit("seeked", { seconds }));
      return seconds;
    }
    async play() { this.paused = false; this.emit("play"); }
    async pause() { this.paused = true; this.emit("pause"); }
    async destroy() { this.destroyed = true; }
    /** Plays forward by `seconds`, firing timeupdate every `step` seconds. */
    async advance(seconds, step = 0.25) {
      const end = this.time + seconds;
      while (this.time < end - 1e-9) {
        this.time = Math.min(end, this.time + step);
        if (this.time >= this.duration) {
          this.time = this.duration;
          this.paused = true;
          this.emit("ended");
          await flush();
          return;
        }
        this.emit("timeupdate", { seconds: this.time });
        await flush();
      }
    }
  }

  window.Vimeo = { Player: FakePlayer };
  return {
    players,
    /** The most recently created player that has not been destroyed. */
    get current() {
      return [...players].reverse().find((player) => !player.destroyed) || null;
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
