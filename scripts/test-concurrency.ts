async function testConcurrency() {
  const requests = Array.from({ length: 5 }, (_, i) =>
    fetch("http://localhost:3000/api/lock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        seatId: 25,
        lockToken: crypto.randomUUID(),
      }),
    }).then(async (response) => ({
      request: i + 1,
      status: response.status,
      body: await response.json(),
    }))
  );

  const results = await Promise.all(requests);

  console.table(results);

  const successfulLocks = results.filter(
    (result) => result.status === 200
  ).length;

  const rejectedLocks = results.filter(
    (result) => result.status === 409
  ).length;

  if (successfulLocks === 1 && rejectedLocks === 4) {
    console.log("CONCURRENCY TEST PASSED");
  } else {
    console.error("CONCURRENCY TEST FAILED");
    process.exitCode = 1;
  }
}

testConcurrency();