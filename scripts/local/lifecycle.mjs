// A failing optional service must not prevent the other service from stopping.
export async function stopServices(stopPlanner, stopGym) {
  const results = await Promise.allSettled([
    Promise.resolve().then(stopPlanner),
    Promise.resolve().then(stopGym),
  ]);
  const errors = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason.message);
  if (errors.length) throw new Error(errors.join("\n"));
}

export async function startOptionalGym(startGym) {
  try {
    await startGym();
    return true;
  } catch (error) {
    console.error(`Academia: ${error.message}`);
    return false;
  }
}
