# Building mods for the Windows build of tgg-melee (x86_64-windows-gnu) in the
# Linux builder image, with MinGW-w64 GCC: the compiler the port is built with
# there (tgg-melee's cmake/toolchains/mingw-w64-x86_64.cmake). The Windows
# SDK carries every option that decides a game struct's layout
# (-mno-ms-bitfields among them), so this file only names the target, the
# compilers and how to link. The Builder passes it to CMake through
# CMAKE_TOOLCHAIN_FILE. flake.nix fills in the @...@ store paths.
set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR AMD64)
set(CMAKE_C_COMPILER x86_64-w64-mingw32-gcc)
set(CMAKE_RC_COMPILER x86_64-w64-mingw32-windres)

foreach(kind EXE SHARED MODULE)
    # No link time in the headers, so the same source and SDK give the same
    # mod.dll on every build, as they give the same mod.so.
    string(APPEND CMAKE_${kind}_LINKER_FLAGS_INIT " -Wl,--no-insert-timestamp")
    # nixpkgs' MinGW GCC uses the mcf thread model and links everything with
    # -lmcfgthread; the game ships libmcfgthread-2.dll for any that import it.
    string(APPEND CMAKE_${kind}_LINKER_FLAGS_INIT " -L@mcfgthreads@/lib")
endforeach()

# Programs come from the image; nothing is looked up as a Windows library.
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
