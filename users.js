const users = {};

function getUser(id) {
  if (!users[id]) {
    users[id] = {
      session:     {},
      history:     [],
      saved:       [],
      lastRecs:    [],
      isPro:       false,
      joinDate:    Date.now(),
      step:        null,
      searchCount: 0,
    };
  }
  return users[id];
}

module.exports = { getUser };
