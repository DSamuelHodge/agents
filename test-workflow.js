// Quick test of the /workflow endpoint
const featureRequest = "Build a simple todo list app with add, delete, and mark complete functionality";

async function testWorkflow() {
  console.log('Testing /workflow endpoint...\n');
  console.log('Feature Request:', featureRequest, '\n');

  try {
    const response = await fetch('http://127.0.0.1:8787/workflow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ featureRequest })
    });

    const result = await response.json();
    
    console.log('Status:', response.status);
    console.log('\nResponse:\n', JSON.stringify(result, null, 2));
    
    if (result.ok) {
      console.log('\n✅ Workflow completed successfully!');
      console.log(`\nGenerated ${result.data.steps.length} steps across ${result.data.steps.filter(s => s.status === 'completed').length} completed agents`);
      
      result.data.steps.forEach((step, idx) => {
        console.log(`\n[${idx + 1}] ${step.roleId.toUpperCase()}`);
        console.log(`  Status: ${step.status}`);
        if (step.output) {
          console.log(`  Output: ${step.output.substring(0, 100)}...`);
        }
        if (step.error) {
          console.log(`  Error: ${step.error}`);
        }
      });
    } else {
      console.log('\n❌ Workflow failed');
      console.log('Error:', result.message);
    }
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testWorkflow();
