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

#### Store size

Remember at most `N` messages (default 200).

```
HUBOT_REACT_STORE_SIZE=N
```

#### Throttle expiration

Throttle responses to the same terms for `N` seconds (default 300).

```
HUBOT_REACT_THROTTLE_EXPIRATION=N
```

#### Initialization timeout

Wait for N milliseconds for hubot to initialize and load brain data from redis. (default 10000)

```
HUBOT_REACT_INIT_TIMEOUT=N
```

### Commands

#### React (single-word term)

Tell hubot to react with `<response>` when it hears `<term>`.

```
hubot react <term> <response>
```

#### React (multi-word term)

Tell hubot to react with `<response>` when it hears `<term>`.

```
hubot react "<term>" <response>
```

#### Ignore

Tell hubot to forget the last `<term>` `<response>` pair that was uttered.

```
hubot ignore that
```

