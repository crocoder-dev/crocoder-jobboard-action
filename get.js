const { exec } = require('@actions/exec');
const { customAlphabet } = require("nanoid");
const fetch = require("node-fetch");
const { Octokit } = require("@octokit/rest");
const nanoid = customAlphabet(
  "ModuleSymbhasOwnPrABCDEFGHNRVfgctiUvzKqYTJkLxpZXIjQW",
  5
);
const { wait, createAsigneeList } = require('./utils');
const { archiveJobs } = require('./archiveAll');

const getJobs = async (url, token) => {
  const result = await fetch(url, {
    "method": "GET",
    "headers": {
      "Authorization": token,
    }
  });
  await wait(200);

  const { published, archived } = await result.json();

  return { published, archived }; 
}


module.exports = async (owner, repo, workingDirectory, branchPrefix, commitMessage, githubToken, pathToContentFolder, jobBoardApiUrl, jobBoardApiToken, asigneeUsernames, startingBranch, archiveBranchPrefix, archiveCommitMessage) => {
  
  const { published, archived } = await getJobs(`${jobBoardApiUrl}/urls`, jobBoardApiToken);

  const octokit = new Octokit({
    auth: githubToken,
  });

  const createdPRs = [];

  const asignees = createAsigneeList(asigneeUsernames.split(','), published.length);

  for (let index = 0; index < published.length; index++) {
    const { url, title, jobPostMarkdown, jobPostFilename, titleCompany, hashtags } = published[index];

    const branch = `${branchPrefix}/${titleCompany}-${nanoid()}`;
    const fullCommitMessage = `${commitMessage} ${title}`;

    await exec('git', ['-C', workingDirectory, 'branch', branch]);
    await wait(200);
    await exec('git', ['-C', workingDirectory, 'checkout', branch]);
    await wait(200);

    await exec('bash', ['-c', `curl ${jobPostMarkdown} -o ${workingDirectory}/${pathToContentFolder}/${jobPostFilename}`]);

    await wait(200);
    await exec('git', ['-C', workingDirectory, 'add', '-A']);
    await wait(200);
    await exec('git', ['-C', workingDirectory, 'commit', '--no-verify', '-m', fullCommitMessage]);
    await wait(200);
    await exec('git', ['-C', workingDirectory, 'push', '--set-upstream', 'origin', branch]);
    await wait(200);


    const response = await octokit.pulls.create({
      owner,
      repo,
      title,
      head: branch,
      base: startingBranch,
      body: `
# ${title}
### ${hashtags.join(' ')}
      
Dear CroCoder devs please use the table to evaluate the job ad.  
If you made any changes to the content of md file, please add a comment to the relevent row.  
Check the content of the job ad [here](https://github.com/${owner}/${repo}/blob/${branch}/${pathToContentFolder}/${jobPostFilename}).
      
Task | Evaluation | Comment
------------ | ------------- | ------------- 
Relevant job post | ✔️ / ❌ |
Readable title | ✔️ / ❌ |
Title has less than 30 letters | ✔️ / ❌ |
Relevant hashtags | ✔️ / ❌ |
Relevant summary | ✔️ / ❌ |
Correct job type | ✔️ / ❌ |
Content formatted correctly | ✔️ / ❌ |
Links are not broken | ✔️ / ❌ |
Changed featured if needed | ✔️ / ❌ |
      `,
      draft: true,
      maintainer_can_modify: true,
    });
    await wait(200);

    const { number } = response.data;

    await octokit.issues.setLabels({
      owner,
      repo,
      issue_number: number,
      labels: ['NEW JOBS'],
    });
    await wait(200);

    await octokit.pulls.requestReviewers({
      owner,
      repo,
      pull_number: number,
      reviewers: [asignees[index]]
    });
    await wait(200);

    await exec('git', ['-C', workingDirectory, 'checkout', startingBranch]);
    console.log(`Lucky asignee is ${asignees[index]}`);

    createdPRs.push({
      branch,
      number,
    });

    const publishResponse = await fetch(`${jobBoardApiUrl}/urls/publish`, {
        "method": "PUT",
        "headers": {
          "Authorization": jobBoardApiToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ urls: [url] }),
    });

    if(!publishResponse.ok) {
      console.log(publishResponse.statusText);
    }

    await wait(1000);
  }

  await exec('git', ['-C', workingDirectory, 'checkout', startingBranch]);
  await wait(200);

  if(archived.length > 0) {
    await archiveJobs(archived, octokit, owner, repo, workingDirectory, pathToContentFolder, archiveBranchPrefix, archiveCommitMessage, asigneeUsernames, startingBranch);
  }
}
