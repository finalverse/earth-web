//! A test process cannot acquire network access through the Node interpreter.
//! This is a narrow OS network boundary, not a full hostile-code VM sandbox.
use anyhow::Result;
use std::path::Path;
use tokio::process::Command;

pub fn command(node: &Path) -> Result<(Command, &'static str)> {
    #[cfg(target_os = "macos")]
    {
        anyhow::ensure!(
            Path::new("/usr/bin/sandbox-exec").is_file(),
            "OS network isolation unavailable; refusing tests"
        );
        let mut command = Command::new("/usr/bin/sandbox-exec");
        command
            .args([
                "-p",
                "(version 1)(allow default)(deny network*)(deny process-fork)",
            ])
            .arg(node);
        Ok((command, "macos-seatbelt-network-and-fork-denial"))
    }
    #[cfg(target_os = "linux")]
    {
        let mut command = Command::new(node);
        // SAFETY: after fork this closure allocates no heap, takes no locks and
        // invokes only prctl with stack-owned, kernel-validated BPF instructions.
        unsafe {
            command.pre_exec(|| {
                #[cfg(target_arch = "x86_64")]
                const ARCH: u32 = 0xc000003e;
                #[cfg(target_arch = "aarch64")]
                const ARCH: u32 = 0xc00000b7;
                #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
                return Err(std::io::Error::other(
                    "Network sandbox architecture unsupported",
                ));
                #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
                {
                    const LD: u16 = 0x20;
                    const JEQ: u16 = 0x15;
                    const JGE: u16 = 0x35;
                    const RET: u16 = 0x06;
                    const ALLOW: u32 = 0x7fff0000;
                    const DENY: u32 = 0x00050000 | libc::EPERM as u32;
                    const KILL: u32 = 0x80000000;
                    let syscalls = [
                        libc::SYS_socket,
                        libc::SYS_socketpair,
                        libc::SYS_connect,
                        libc::SYS_bind,
                        libc::SYS_listen,
                        libc::SYS_accept,
                        libc::SYS_accept4,
                        libc::SYS_sendto,
                        libc::SYS_sendmsg,
                        libc::SYS_sendmmsg,
                    ];
                    let mut instructions = [libc::sock_filter {
                        code: 0,
                        jt: 0,
                        jf: 0,
                        k: 0,
                    }; 32];
                    let mut count = 0;
                    macro_rules! add {
                        ($code:expr,$jt:expr,$jf:expr,$k:expr) => {{
                            instructions[count] = libc::sock_filter {
                                code: $code,
                                jt: $jt,
                                jf: $jf,
                                k: $k,
                            };
                            count += 1;
                        }};
                    }
                    add!(LD, 0, 0, 4);
                    add!(JEQ, 1, 0, ARCH);
                    add!(RET, 0, 0, KILL);
                    add!(LD, 0, 0, 0);
                    add!(JGE, 0, 1, 0x40000000);
                    add!(RET, 0, 0, DENY);
                    for syscall in syscalls {
                        add!(JEQ, 0, 1, syscall as u32);
                        add!(RET, 0, 0, DENY);
                    }
                    add!(RET, 0, 0, ALLOW);
                    let program = libc::sock_fprog {
                        len: count as u16,
                        filter: instructions.as_mut_ptr(),
                    };
                    if libc::prctl(
                        libc::PR_SET_NO_NEW_PRIVS,
                        1 as libc::c_ulong,
                        0 as libc::c_ulong,
                        0 as libc::c_ulong,
                        0 as libc::c_ulong,
                    ) != 0
                    {
                        return Err(std::io::Error::last_os_error());
                    }
                    if libc::prctl(
                        libc::PR_SET_SECCOMP,
                        libc::SECCOMP_MODE_FILTER as libc::c_ulong,
                        &program as *const libc::sock_fprog,
                    ) != 0
                    {
                        return Err(std::io::Error::last_os_error());
                    }
                }
                Ok(())
            });
        }
        Ok((command, "linux-seccomp-network-denial"))
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = node;
        anyhow::bail!("Verified OS network isolation is unavailable; refusing tests")
    }
}
