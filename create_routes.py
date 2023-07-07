#!/usr/bin/python3

import os
import re
import sys

ROUTES_DIR = 'src/routes'

def collect_files(dir: str, files: list[str]) -> None:
	names = os.listdir(dir)
	for n in names:
		p = os.path.join(dir, n)
		if os.path.isfile(p): files.append(p.replace('\\', '/'))
		else: collect_files(p, files)

def into_module(path: str) -> tuple[str, str]:
	suffix = path[len(ROUTES_DIR) + 1:]
	mod_parts = re.split('[^a-zA-Z0-9]', suffix)
	head = mod_parts.pop(0)
	tail = [e[0].upper() + e[1:].lower() for e in mod_parts]
	name = head + ''.join(tail)
	return name

def into_route(path: str) -> str:
	file = path[len(ROUTES_DIR):]
	basename = os.path.basename(file)
	split = basename.find('.')
	name = basename[:split] if split >= 0 else basename
	route_prefix = file[:-len(basename)]
	if name == 'index': return os.path.normpath(route_prefix) 
	else: return route_prefix + name

if not os.path.isdir(ROUTES_DIR):
	print(f'`{ROUTES_DIR}` does not exist or is not a directory.')
	print('This script must be started from the project root.')
	sys.exit(1)

files = []
collect_files(ROUTES_DIR, files)

routes = [into_route(e) for e in files]
modules = [into_module(e) for e in files]
file_modules = zip(files, modules)
route_modules = zip(routes, modules)

hash_lines = [f"'{route}': {module}," for (route, module) in route_modules]

with open('src/routes.ts', 'w') as out:
	out.write("import { HandlerModule } from './lib/request_types';\n")
	for (file, module) in file_modules:
		path = file[4:] # Remove src/
		if path.endswith('.ts'): path = path[:-3]
		out.write(f"import * as {module} from './{path}';\n")

	out.write('\nconst routes: { [pathname: string]: HandlerModule } = {\n\t')
	out.write('\n\t'.join(hash_lines))
	out.write('\n};\n\nexport default routes;\n')
