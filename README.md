### hubot-react

Train hubot to react to certain terms.

```
Bob: hubot react homestar seriously.
Hubot: homestar will trigger seriously.
...
Alice: Homestar Runner is the best.
Hubot: seriously.
```

Configuration:

- `HUBOT_REACT_CACHE_SIZE=N` - Cache the last N messages for each user for potential remembrance (default 25).

- `HUBOT_REACT_STORE_SIZE=N` - Remember at most N messages (default 200).


Commands:

`hubot react <term> <response>` - tell hubot to react with `<response>` when it hears `<term>`

`hubot ignore that` - tell hubot to forget the last `<term>` `<response>` pair that was uttered.

