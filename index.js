const core = require('@actions/core');
const { exec } = require('@actions/exec');
const { Octokit } = require("@octokit/rest");
const fetch = require("node-fetch");


(async () => {
  try {

    const workingDirectory = core.getInput('working-directory');
    const authorName = core.getInput('author-name');
    const authorEmail = core.getInput('author-email');
    const branchPrefix = core.getInput('branch-prefix');
    const commitMessage = core.getInput('commit-message');
    const githubToken = core.getInput('github-token');
    const pathToContentFolder = core.getInput('content-folder-path');
    const startingBranch = core.getInput('starting-branch')
    const jobBoardApiUrl = core.getInput('jobboard-api');
    const jobBoardApiToken= core.getInput('jobboard-token');

    const octokit = new Octokit({
      auth: githubToken,
    });
    
    await exec('git', [ '-C', workingDirectory, 'config', '--local', 'user.name', authorName ])
    await exec('git', [ '-C', workingDirectory, 'config', '--local', 'user.email', authorEmail ])

    const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/')

    const result = await fetch(jobBoardApiUrl, {
      "method": "GET",
      "headers": {
        "authorization": jobBoardApiToken,
      }
    });

    const jobs = await result.json(); 

    jobs.foreach(job => {

      const { title, jobPostMarkdown, jobPostFilename, titleCompany } = job;

      const branch = `${branchPrefix}/${titleCompany}`;
      const fullCommitMessage = `${commitMessage} ${title}`;

      await exec('git', [ '-C', workingDirectory, 'branch', branch]);
      await exec('git', [ '-C', workingDirectory, 'checkout', branch]);

      await exec('curl', [ jobPostMarkdown, '>' `${workingDirectory}/${pathToContentFolder}/${jobPostFilename}`]);
      
      await exec('git', [ '-C', workingDirectory, 'add', '-A' ]);
      await exec('git', [ '-C', workingDirectory, 'commit', '--no-verify', '-m', fullCommitMessage ]);


      await octokit.pulls.create({
        owner,
        repo,
        title,
        head: branch,
        base: 'development',
        body: `
          ${title}
          ${new Date(datetime)}
        `,
        draft: true,
        maintainer_can_modify: true,
      });


      await exec('git', [ '-C', workingDirectory, 'checkout', startingBranch]);
    
    });
  } catch (error) {
    core.setFailed(error.message)
  }
})();