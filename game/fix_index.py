import os

file_path = r'c:\Users\naka6\Projects\AROnmyouji\game\index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Define markers
placeholder_start_marker = '    <!-- Loading Screen (New) -->'
placeholder_end_marker = '    <!-- WRAPPER FOR CRT ANIMATION - INITIALLY HIDDEN (Screen Off) -->'
orphaned_start_marker = '            <!-- Top Left Info -->'
orphaned_end_marker = '        <!-- Gameplay Screen (Updated with User\'s HUD) -->'

# Find indices
placeholder_start = -1
placeholder_end = -1
orphaned_start = -1
orphaned_end = -1

for i, line in enumerate(lines):
    if placeholder_start == -1 and placeholder_start_marker in line:
        placeholder_start = i
    if placeholder_end == -1 and placeholder_end_marker in line:
        placeholder_end = i
    if orphaned_start == -1 and orphaned_start_marker in line:
        orphaned_start = i
    if orphaned_end == -1 and orphaned_end_marker in line:
        orphaned_end = i

print(f"Indices found: P_Start={placeholder_start}, P_End={placeholder_end}, O_Start={orphaned_start}, O_End={orphaned_end}")

if placeholder_start == -1 or placeholder_end == -1 or orphaned_start == -1 or orphaned_end == -1:
    print("Error: Could not find all markers.")
    exit(1)

# Extract orphaned content
orphaned_content = lines[orphaned_start:orphaned_end]

# Header to insert
header = [
    '    <!-- Loading Screen (New) -->\n',
    '    <div id="loadingScreen"\n',
    '        class="screen active absolute inset-0 z-[60] flex flex-col items-center justify-center bg-background-light dark:bg-background-dark text-black dark:text-white font-mono overflow-hidden transition-colors duration-500">\n',
    '        <!-- Background elements -->\n',
    '        <!-- Background elements (Moved to global) -->\n',
    '\n'
]

# Construct new file content
# Parts:
# 1. Before placeholder
# 2. Header + Orphaned Content
# 3. Between placeholder end and orphaned start
# 4. After orphaned end

part1 = lines[:placeholder_start]
part2 = lines[placeholder_end:orphaned_start]
part3 = lines[orphaned_end:]

new_lines = part1 + header + orphaned_content + part2 + part3

# Check reasonable length
print(f"Original lines: {len(lines)}")
print(f"New lines: {len(new_lines)}")

# Write back
with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Successfully updated index.html")
