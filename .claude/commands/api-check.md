Verify that this frontend project's integration with ruby_raider (the backend gem) is correct.

Steps:
1. Find all places in `src/` where this app calls ruby_raider:
   - Shell exec / child_process calls to the `raider` CLI
   - IPC handlers that invoke ruby_raider commands
   - Any parameter structures sent to the backend

2. Read the ruby_raider programmatic API:
   - Check `/Users/augustingottlieb/ruby_raider/lib/generators/invoke_generators.rb` for expected parameters
   - Check `/Users/augustingottlieb/ruby_raider/lib/ruby_raider.rb` for CLI command interface

3. Report:
   - Any mismatches between what this app sends and what ruby_raider expects
   - ruby_raider features not yet available in the desktop UI
   - Suggestions for new UI features based on available backend capabilities
