### hubot-react

Train hubot to react to certain terms. Multiple responses to the same term are allowed. One will be selected at-random.

```
Bob: hubot react homestar seriously.
Hubot: reacting to homestar with seriously.
...
Alice: Homestar Runner is the best.
Hubot: seriously.
```

### Matching

It currently uses [natural](https://github.com/NaturalNode/natural)'s `PorterStemmer` to match words regardless of conjugation, tense, etc. This is almost certainly going to change as I experiment with it more.

### Configuration

- `HUBOT_REACT_STORE_SIZE=N` - Remember at most N messages (default 200).


### Commands

`hubot react <term> <response>` - tell hubot to react with `<response>` when it hears `<term>` (single word)
`hubot react "<term>" <response>` - tell hubot to react with `<response>` when it hears `<term>` (multiple words)

`hubot ignore that` - tell hubot to forget the last `<term>` `<response>` pair that was uttered.

