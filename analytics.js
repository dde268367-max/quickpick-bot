const { PostHog } = require('posthog-node');

const client = new PostHog(process.env.POSTHOG_KEY, {
  host: 'https://us.i.posthog.com',
  flushAt: 5,
  flushInterval: 10000,
});

// Відстежуємо подію
function track(userId, event, properties = {}) {
  if (!process.env.POSTHOG_KEY) return;
  try {
    client.capture({
      distinctId: String(userId),
      event,
      properties,
    });
  } catch (e) {
    // Аналітика не повинна ламати бота
  }
}

// Ідентифікуємо юзера
function identify(userId, properties = {}) {
  if (!process.env.POSTHOG_KEY) return;
  try {
    client.identify({
      distinctId: String(userId),
      properties,
    });
  } catch (e) {}
}

module.exports = { track, identify };
