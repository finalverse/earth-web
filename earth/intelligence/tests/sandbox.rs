//! Actual subprocess boundaries; no database or model service required.
use earth_intelligence::coding::Coding;
use std::{path::PathBuf, time::Duration};
use tokio_util::sync::CancellationToken;

#[tokio::test]
#[ignore = "requires explicit Node 24 path and supported OS sandbox"]
async fn restricted_tests_deny_network_files_writes_children_and_bound_output_and_cancellation() {
    let node = PathBuf::from(
        std::env::var_os("EARTH_INTELLIGENCE_NODE_BINARY").expect("Explicit Node 24 binary"),
    );
    let root = tempfile::tempdir().unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let source = format!(
        r#"import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import net from 'node:net';import {{spawnSync}} from 'node:child_process';
test('rooted reads',()=>assert.throws(()=>fs.readFileSync('/etc/passwd'),{{code:'ERR_ACCESS_DENIED'}}));
test('writes',()=>assert.throws(()=>fs.writeFileSync(new URL('./forbidden',import.meta.url),'x'),{{code:'ERR_ACCESS_DENIED'}}));
test('children',()=>assert.throws(()=>spawnSync('/usr/bin/true'),{{code:'ERR_ACCESS_DENIED'}}));
test('network',async()=>assert.rejects(new Promise((resolve,reject)=>{{const socket=net.createConnection({{host:'127.0.0.1',port:{port}}});socket.on('connect',()=>{{socket.destroy();reject(new Error('Network unexpectedly allowed'));}});socket.on('error',reject);}}),e=>['EPERM','EACCES','ERR_ACCESS_DENIED'].includes(e.code)));
"#
    );
    std::fs::write(root.path().join("guard.test.mjs"), source).unwrap();
    let coding = Coding::new(root.path(), Some(&node)).unwrap();
    let result = coding
        .run_test(&["guard.test.mjs".into()], &[], CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(result["exit_code"], 0, "OS guard failed: {result}");
    assert!(!root.path().join("forbidden").exists());
    std::fs::write(
        root.path().join("noisy.test.mjs"),
        "process.stdout.write('x'.repeat(200000));",
    )
    .unwrap();
    let noisy_start = std::time::Instant::now();
    assert!(
        coding
            .run_test(&["noisy.test.mjs".into()], &[], CancellationToken::new())
            .await
            .is_err()
    );
    assert!(
        noisy_start.elapsed() < Duration::from_secs(5),
        "Overflow did not terminate promptly"
    );
    std::fs::write(
        root.path().join("waiting.test.mjs"),
        "setInterval(()=>{},100);",
    )
    .unwrap();
    let token = CancellationToken::new();
    let cancellation = token.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        cancellation.cancel();
    });
    let start = std::time::Instant::now();
    assert!(
        coding
            .run_test(&["waiting.test.mjs".into()], &[], token)
            .await
            .is_err()
    );
    assert!(
        start.elapsed() < Duration::from_secs(5),
        "Cancellation did not bound the child"
    );
}
