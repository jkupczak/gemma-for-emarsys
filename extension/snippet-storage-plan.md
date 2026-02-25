I want to modify how we store snippets in Chrome Sync Storage. The goal is to allow the user to store a large amount of snippet related data while avoiding needing to rely on IndexedDB or Local Storage because those areas cannot be backed up by Chrome. So we need to maximize information density per byte and stay within these limits:

- Total quota ≈ 102,400 bytes
- Per item ≈ 8,192 bytes
- Max items ≈ 512

The strategy is basically: Make the data smaller → compress it → pack it → chunk it efficiently. Below is my proposed pipeline to use to squeeze the absolute maximum into sync storage.

1. Normalize the data first

This will help with compression and make the data more predictable.

Example:

Before normalization

```
  {
    "category": "Languages",
    "content": "{{ rds.rds_babbel.personalization_locale_learn_language(contact.5753, contact.5758)[0].LearnLangAll|raw}}",
    "description": "",
    "favorite": false,
    "id": "snippet-1767132006024-8z1xafra9",
    "name": "LearnLangAll",
    "swapKeywords": [
        {
            "initiateFrom": "anywhere",
            "keyword": "(name)",
            "matchRule": "partial",
            "mode": "token"
        },
        {
            "initiateFrom": "panel",
            "keyword": "{name}",
            "matchRule": "whole",
            "mode": "plain"
        },
        {
            "initiateFrom": "toolbar",
            "keyword": "{names}",
            "matchRule": "partial",
            "mode": "token"
        }
    ]
  }
```

After normalization

```
  {
    "category": "Languages",
    "content": "{{ rds.rds_babbel.personalization_locale_learn_language(contact.5753, contact.5758)[0].LearnLangAll|raw}}",
    "description": "",
    "favorite": 0,
    "id": "snippet-1767132006024-8z1xafra9",
    "name": "LearnLangAll",
    "swapKeywords": [
        {
            "initiateFrom": "a",
            "keyword": "(name)",
            "matchRule": "p",
            "mode": "t"
        },
        {
            "initiateFrom": "p",
            "keyword": "{name}",
            "matchRule": "w",
            "mode": "p"
        },
        {
            "initiateFrom": "t",
            "keyword": "{names}",
            "matchRule": "p",
            "mode": "t"
        }
    ]
  }
```

The following properties are eligible for normalization:
 - favorite -> 0 or 1
 - initiateFrom -> a, p, t
 - matchRule -> p, w
 - mode -> t, p

2. Strip unnecessary trailing whitespace from code ("content" and "description".)
Example, instead of:

```

<b>This is a bold text</b>


```

Use:

```
<b>This is a bold text</b>
```

3. Convert objects into arrays
Remove keys entirely to save on space. Example, instead of:

  {
    "category": "Languages",
    "content": "{{ rds.rds_babbel.personalization_locale_learn_language(contact.5753, contact.5758)[0].LearnLangAll|raw}}",
    "description": "",
    "favorite": false,
    "id": "snippet-1767132006024-8z1xafra9",
    "name": "LearnLangAll",
    "swapKeywords": [
      {
        "initiateFrom": "a",
        "keyword": "(LearnLangAll)",
        "matchRule": "p",
        "mode": "t"
      },
      {
        "initiateFrom": "a",
        "keyword": "{LearnLangAll}",
        "matchRule": "p",
        "mode": "t"
      }
    ]
  }

Store it as an array:

["Languages","{{ rds.rds_babbel.personalization_locale_learn_language(contact.5753, contact.5758)[0].LearnLangAll|raw}}","",false,"snippet-1767132006024-8z1xafra9","LearnLangAll",[["a","(LearnLangAll)","p","t"],["a","{LearnLangAll}","p","t"]]]

4. Compress the data
Do not store each snippet individually in sync storage. One packed dataset compresses far better than many small ones. Compression works better on larger data. So we need to pack the data into a single dataset and then chunk it. 

This is where the biggest savings should come from. Best options inside extensions:

- LZ-String (easy)
- pako (gzip)
- fflate (very fast)

Please research and suggest the best option.

5. Encode to a storage-safe string
chrome.storage stores JSON-compatible values. Binary must become a string.

Options:

- Base64
- UTF16-safe compression (lz-string has this)

Please research and suggest the best option.

6. Chunk the compressed payload efficiently
Because each key in sync storage has its own byte limit, lets breakdown the data into chunks to stay within the limit.

Example:

```
function chunk(str, size = 7000) {
  const result = [];
  for (let i = 0; i < str.length; i += size) {
    result.push(str.slice(i, i + size));
  }
  return result;
}
```

Store as:

```
s0
s1
s2
s3
s_meta
```

Meta example:

```
{
 "v":1,
 "c":4
}
```

Where c = chunk count.

The byte limit for each key is 8192. Please advise how large we should make each chunk to stay safe.

7. Optimize key names in sync storage
Key names count toward quota and should be as short as possible.

Bad:

```
snippet_backup_chunk_0001
```

Better:

```
s0
s1
s2
```

Please research and suggest the best option.

8. Mitigating issues with write operations to sync storage
Sync storage has a limit on how many writes per minute we can do. For this, and possibly other reasons, we need to decide if it's best if the snippets are stored in local storage for the purposes of user edits and new snippet creation. And then we periodically normalize, compress, and chunk the data and store it in sync storage.

I don't feel it will be necessary because I don't foresee users creating or editing snippets at a rate that would exceed the limit. But maybe there are other good reasons to do this that are not related to write operations. I'm open to your opinion on this.

9. Migration to the new format for existing users
When we deploy the new format, we need to be able to migrate existing users who are using the old format.

 - 1. Fetch their existing data from the `gemSnippets` key in Chrome Sync Storage
 - 2. Applying the normalization steps described above
 - 3. Compressing and chunking the data
 - 4. Deleting the old `gemSnippets` key in Chrome Sync Storage

This ensures a smooth transition with no downtime.

Please research and suggest the best option.