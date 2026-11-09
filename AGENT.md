## Rules of engagement for coding agents 
Whenever doing any development work. Please make sure that my local copy (/Users/adamnlin/Documents/Dev/on-track-mobile) is on that branch. I like to review the code using my IDE of choice. When the agent does work in the worktree, I can't see it. So once you've committed work, just make sure my local copy is up to date with those changes. If there are conflicts, for exmaple if I have multiple agents doing work in parallel, tell me you can't pick and ask me which branch should my local copy be on. If there are uncommitted changes, just ask if you can discard them (the answer is usually yes though). 

When asked to make a feature for on-track:
- Always test it using xcode simulator via expo go.
- Always create a PR so a human can review and merge
- Rather than adding noisy subtext to explain features in the app, it is typically better to favour intuitive UI.
   - eg. gear icon instead of the word 'settings'
   - eg. placement of operations is very relevant to this. And general flow of the UX

When asked to make a new deployment, always leave it as the same testflight build version. Otherwise it takes longer for me to rollout changes to testers.
