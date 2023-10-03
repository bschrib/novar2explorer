class CloudflareR2App {
	constructor() {
		this.localFileProvider = new FileProvider();
		this.localFileTreeView = new TreeView("localFiles", { dataProvider: this.localFileProvider });
		nova.subscriptions.add(this.localFileTreeView);

		this.cloudflareR2FileProvider = new CloudflareR2FileProvider();
		this.cloudflareR2FileTreeView = new TreeView("cloudflareR2Files", { dataProvider: this.cloudflareR2FileProvider });
		this.cloudflareR2FileTreeView.onDidChangeSelection(() => {
			const selectedItem = this.getCurrentSelection()[0];
			if (selectedItem) {
				this.cloudflareR2FileProvider.currentFolderPath = selectedItem;
			}
		});
		nova.subscriptions.add(this.cloudflareR2FileTreeView);
		
		this.cloudflareR2FileProvider.refreshFiles().then(() => {
			this.cloudflareR2FileTreeView.reload();
		});

		this.init();
	}

	init() {
		if (typeof URL === 'undefined') {
			this.URL = function(urlString) {
				let anchor = document.createElement('a');
				anchor.href = urlString;
				return anchor;
			};
		}

		this.registerCommands();
	}

	registerCommands() {
		nova.commands.register("cloudflarer2.upload", async () => {
			const selectedFiles = this.getLocalFileSelection();
			for (const file of selectedFiles) {
				await this.cloudflareR2FileProvider.uploadFileToCloudflareR2(file.uri);
			}
			await this.refreshCloudflareFilesAndReloadView();
		});

		nova.commands.register("cloudflarer2.refreshR2", async () => {
			await this.refreshCloudflareFilesAndReloadView();
		});

		nova.commands.register("cloudflarer2.refresh", async () => {
			await this.localFileProvider.refreshFiles();
			this.localFileTreeView.reload();
		});

		nova.commands.register("cloudflarer2.deleteR2", async () => {
			const selectedFiles = this.getCurrentSelection();
			for (const file of selectedFiles) {
				await this.cloudflareR2FileProvider.deleteFileFromCloudflareR2(file);
			}
			this.cloudflareR2FileTreeView.reload();
		});
		
		nova.commands.register("cloudflarer2.navigateUp", async () => {
		  this.cloudflareR2FileProvider.navigateUp();
		  this.cloudflareR2FileTreeView.reload();
		});
	}
	
	async refreshCloudflareFilesAndReloadView() {
		await this.cloudflareR2FileProvider.refreshFiles();
		this.cloudflareR2FileTreeView.reload();
	}
	
	getCurrentSelection() {
		return this.cloudflareR2FileTreeView.selection;
	}
	
	getLocalFileSelection() {
		return this.localFileTreeView.selection;
	}
}

function buildFileTree(contents) {
	const rootNode = { children: {} };

	for (const item of contents) {
		const parts = item.Key.split('/');
		let currentNode = rootNode;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (!currentNode.children[part]) {
				if (i === parts.length - 1) {
					currentNode.children[part] = item;
				} else {
					currentNode.children[part] = { children: {} };
				}
			}
			currentNode = currentNode.children[part];
		}
	}

	return rootNode;
}

class File {
	constructor(uri, isFolder = false) {
		this.uri = uri;
		this.name = nova.path.basename(uri);
		this.isFolder = isFolder;
	}
}

class FileProvider {
	constructor() {
		this.files = [];
		this.refreshFiles();
	}

	async refreshFiles(parentUri = nova.workspace.path) {
	
		try {
			const fileURIs = await nova.fs.listdir(parentUri);
	
			const absoluteFileURIs = fileURIs.map(uri => nova.path.join(parentUri, uri));
	
			const fileStatsPromises = absoluteFileURIs.map(async absoluteUri => {
				try {
					const stats = await nova.fs.stat(absoluteUri);
	
					if (stats) { 
						const isDir = stats.isDirectory();
						return new File(absoluteUri, isDir);
					}
				} catch (error) {
					console.error("Error processing URI:", absoluteUri, error);
				}
				return null;
			});
	
			this.files = (await Promise.all(fileStatsPromises)).filter(file => file !== null);
		} catch (error) {
			console.error("Error listing URIs for:", parentUri, error);
		}
	}

	async getChildren(element) {
		if (!element) {
			return this.files;
		}
		if (element.isFolder) {
			await this.refreshFiles(element.uri);
			return this.files;
		}
		return [];
	}


	getTreeItem(element) {
		let item = new TreeItem(element.name);
		if (element.isFolder) {
			item.collapsibleState = TreeItemCollapsibleState.Collapsed;
		} else {
			item.command = "cloudflarer2.upload";
		}
		return item;
	}

}

class CloudflareR2File {
	constructor(key, isFolder = false, lastModified, eTag, size, storageClass, owner) {
		this.key = key;
		this.name = key.split('/').pop();
		this.isFolder = isFolder;
		this.lastModified = lastModified;
		this.eTag = eTag;
		this.size = size;
		this.storageClass = storageClass;
		this.owner = owner;
	}
}

class CloudflareR2FileProvider {
	constructor() {
		this.files = [];
		this.currentFolderPath = '';
		this.refreshFiles();
	}
	
	async refreshFiles() {
		return new Promise((resolve, reject) => {
			try {
				console.log('Refreshing Cloudflare R2 Files');
				
				this.bucket = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2Bucket", "string");
				const accessKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccessKey", "string");
				const secretKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2SecretKey", "string");
				const accountId = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccountId", "string");
				
				let args = [
					"AWS_ENDPOINT_URL=https://" + accountId + ".r2.cloudflarestorage.com",
					"AWS_DEFAULT_OUTPUT=json",
					"AWS_DEFAULT_REGION=auto",
					"AWS_ACCESS_KEY_ID=" + accessKey,
					"AWS_SECRET_ACCESS_KEY=" + secretKey,
					"aws", "s3api", "list-objects", "--bucket", this.bucket
				];
				if (this.currentFolderPath !== "") {
					args.push("--prefix", this.currentFolderPath);
				}
	
				let process = new Process("/usr/bin/env", {
					args: args,
					shell: true
				});
				
				let accumulatedOutput = "";
				
				process.onStdout((output) => {
					accumulatedOutput += output;
				});
				
				process.onStderr((error) => {
					console.error("Error:", error);
				});
				
				process.onDidExit((exitCode) => {
					if (exitCode === 0) {
						const parsedOutput = JSON.parse(accumulatedOutput);
						this.files = parsedOutput.Contents.map(item => {
							const isFolder = item.Key.endsWith('/');
							return new CloudflareR2File(
								item.Key, 
								isFolder,
								item.LastModified,
								item.ETag,
								item.Size,
								item.StorageClass,
								item.Owner
							);
						});
						this.fileTree = buildFileTree(parsedOutput.Contents);
						resolve();
					} else {
						console.error("Process exited with code:", exitCode);
						reject(new Error("Process exited with code: " + exitCode));
					}
				});
				
				process.start();
			
			} catch (error) {
				console.error("Error fetching files from Cloudflare R2:", error);
				reject(error);
			}
		});
	}
	
	async deleteFileFromCloudflareR2(file) {
		return new Promise((resolve, reject) => {
			try {
				const bucket = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2Bucket", "string");
				const accessKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccessKey", "string");
				const secretKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2SecretKey", "string");
				const accountId = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccountId", "string");
				
				let args = [
					"AWS_ENDPOINT_URL=https://" + accountId + ".r2.cloudflarestorage.com",
					"AWS_DEFAULT_OUTPUT=json",
					"AWS_DEFAULT_REGION=auto",
					"AWS_ACCESS_KEY_ID=" + accessKey,
					"AWS_SECRET_ACCESS_KEY=" + secretKey,
					"aws", "s3api", "delete-object", "--bucket", bucket, "--key", file.key
				];
				
				console.log('Running with args: ', args)
				let process = new Process("/usr/bin/env", {
					args: args,
					shell: true
				});
				
				process.onStdout((output) => {
					// console.log("Output:", output);
				});
				
				process.onStderr((error) => {
					console.error("Error:", error);
				});
				
				process.onDidExit(async (exitCode) => {
					if (exitCode === 0) {
						console.log("File deleted successfully:", file.name);
						this.files = this.files.filter(file => file.key !== file.name);
						this.fileTree = buildFileTree(this.files.map(file => ({ Key: file.key })));
						
						// Reset the current folder path to root after deleting
						this.currentFolderPath = '';
						await this.refreshFiles();
						this.cloudflareR2FileTreeView.reload();
						
						resolve();
					} else {
						console.error("Process exited with code:", exitCode);
						reject(new Error("Process exited with code: " + exitCode));
					}
				});
				
				process.start();
			
			} catch (error) {
				console.error("Error deleting file from Cloudflare R2:", error);
				reject(error);
			}
		});
	}
	
	async uploadFileToCloudflareR2(filePath) {
		return new Promise((resolve, reject) => {
			try {
				const bucket = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2Bucket", "string");
				const accessKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccessKey", "string");
				const secretKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2SecretKey", "string");
				const accountId = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccountId", "string");
				const fileName = nova.path.basename(filePath);
	
				const targetPath = this.currentFolderPath ? `${this.currentFolderPath}/${fileName}` : fileName;
				let process = new Process("/usr/bin/env", {
					args: [
						`AWS_ENDPOINT_URL=https://${accountId}.r2.cloudflarestorage.com`,
						"AWS_DEFAULT_OUTPUT=json",
						"AWS_DEFAULT_REGION=auto",
						`AWS_ACCESS_KEY_ID=${accessKey}`,
						`AWS_SECRET_ACCESS_KEY=${secretKey}`,
						"aws", "s3api", "put-object", "--bucket", bucket, "--key", targetPath, "--body", filePath
					],
					shell: true
				});
	
				process.onStdout((output) => {
					// console.log("Output:", output);
				});
	
				process.onStderr((error) => {
					console.error("Error:", error);
				});
	
				process.onDidExit(async (exitCode) => {
					if (exitCode === 0) {
						console.log("File uploaded successfully:", fileName);
						this.files.push(new CloudflareR2File(fileName));
						
						// Reset the current folder path to root after uploading
						this.currentFolderPath = '';
						await this.refreshFiles();
						this.cloudflareR2FileTreeView.reload();
						
						resolve();
					} else {
						console.error("Process exited with code:", exitCode);
						reject(new Error("Process exited with code: " + exitCode));
					}
				});
	
				process.start();
	
			} catch (error) {
				console.error("Error uploading file to Cloudflare R2:", error);
				reject(error);
			}
		});
	}
	
	getRoot() {
		return new TreeItem(this.bucket, TreeItemCollapsibleState.Expanded);
	}

	getChildren(element) {
		if (!this.fileTree || !this.fileTree.children) {
			return [];
		}
	
		let items = [];
		if (this.currentFolderPath) {
			items.push(new CloudflareR2File("..", true));
		}
		
		if (!element) {
			return Object.keys(this.fileTree.children).map(key => {
				const fullPath = this.currentFolderPath ? `${this.currentFolderPath}/${key}` : key;
				return new CloudflareR2File(fullPath, this.fileTree.children[key].children !== undefined);
			});
		}
		if (element.isFolder && this.fileTree.children[element.name]) {
			return Object.keys(this.fileTree.children[element.name].children).map(key => {
				const fullPath = `${element.key}/${key}`;
				return new CloudflareR2File(fullPath, this.fileTree.children[element.name].children[key].children !== undefined);
			});
		}
		return items.concat(/* existing items */);
	}
	
	getTreeItem(element) {
		let item = new TreeItem(element.name);
		if (element.isFolder) {
			if (element.name === this.currentFolderPath.split('/').pop()) {
				item.collapsibleState = TreeItemCollapsibleState.Expanded;
			} else {
				item.collapsibleState = TreeItemCollapsibleState.Collapsed;
			}
		} else {
			item.command = "cloudflarer2.deleteR2";
		}
		return item;
	}
	
	getParentFolderPath() {
		console.log('Current Folder Path: ', this.currentFolderPath)
		const parts = this.currentFolderPath.split('/');
		parts.pop();
		console.log('Returned Folder Path: ', parts.join('/'))
		return parts.join('/');
	}
}

exports.activate = function() {
	new CloudflareR2App();
}

exports.deactivate = function() {
	// Clean up any state or listeners here if needed
}
