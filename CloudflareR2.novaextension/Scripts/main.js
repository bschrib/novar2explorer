class CloudflareR2App {
	constructor() {
		this.localFileProvider = new FileProvider();
		this.localFileTreeView = new TreeView("localFiles", { dataProvider: this.localFileProvider });
		nova.subscriptions.add(this.localFileTreeView);

		this.cloudflareR2FileProvider = new CloudflareR2FileProvider();
		this.cloudflareR2FileTreeView = new TreeView("cloudflareR2Files", { dataProvider: this.cloudflareR2FileProvider });
		this.cloudflareR2FileTreeView.onDidChangeSelection(() => {
			const selectedItem = this.getCurrentR2Selection()[0];
			if (selectedItem) {
				if (selectedItem.isFolder) {
					this.cloudflareR2FileProvider.currentR2FolderPath = selectedItem.key + '/';
				} else {
					this.cloudflareR2FileProvider.currentR2FolderPath = selectedItem.prefix;
				}
			} else {
				this.cloudflareR2FileProvider.currentR2FolderPath = '';
			}
		});
		nova.subscriptions.add(this.cloudflareR2FileTreeView);

		this.init();
		this.refreshR2FilesAndReloadView();
	}

	init() {
		this.registerCommands();
	}

	registerCommands() {
		nova.commands.register("cloudflarer2.upload", async () => {
			const selectedLocalFiles = this.getLocalFileSelection();
			for (const file of selectedLocalFiles) {
				await this.cloudflareR2FileProvider.uploadFileToCloudflareR2(file);
			}
			await this.refreshR2FilesAndReloadView();
		});
		
		nova.commands.register("cloudflarer2.deleteR2", async () => {
			const selectedRemoteFiles = this.getCurrentR2Selection();
			for (const file of selectedRemoteFiles) {
				await this.cloudflareR2FileProvider.deleteFileFromCloudflareR2(file);
			}
			await this.refreshR2FilesAndReloadView();
		});

		nova.commands.register("cloudflarer2.refresh", async () => {
			await this.localFileProvider.refreshFiles();
			this.localFileTreeView.reload();
		});
		
		nova.commands.register("cloudflarer2.refreshR2", async () => {
			await this.refreshR2FilesAndReloadView();
		});		
	}
	
	async refreshR2FilesAndReloadView() {
		await this.cloudflareR2FileProvider.refreshFiles();
		this.cloudflareR2FileTreeView.reload();
		this.cloudflareR2FileProvider.currentR2FolderPath = '';
	}
	
	getCurrentR2Selection() {
		return this.cloudflareR2FileTreeView.selection;
	}
	
	getLocalFileSelection() {
		return this.localFileTreeView.selection;
	}
}

function buildFileTree(contents) {
	const rootNode = { children: {} };

	for (const item of contents) {
		const parts = item.Key.split('/').filter(part => part.trim() !== '');
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

	// console.log("Built file tree:", JSON.stringify(rootNode, null, 2));
	return rootNode;
}

class File {
	constructor(uri, isFolder = false) {
		this.uri = uri;
		this.name = nova.path.basename(uri);
		this.isFolder = isFolder;
	}
}

class CloudflareR2File {
	constructor(key, isFolder = false, lastModified, eTag, size, storageClass, owner) {
		this.key = key;
		this.name = key.split('/').pop();
		this.prefix = key.substring(0, key.lastIndexOf(this.name));
		this.isFolder = isFolder;
		this.lastModified = lastModified;
		this.eTag = eTag;
		this.size = size;
		this.storageClass = storageClass;
		this.owner = owner;
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
			item.image = "__builtin.path";
			// console.log("FileProvider: For " + element.name + " setting extension to: __builtin.path");
		} else {
			item.command = "cloudflarer2.upload";
			let fileExtension = element.name.split(".").pop();
			item.image = "__filetype." + fileExtension;
			// console.log("FileProvider: For " + element.name + " setting extension to: " + fileExtension);
		}
		return item;
	}
}

class CloudflareR2FileProvider {
	constructor() {
		this.files = [];
		this.currentR2FolderPath = '';
		this.bucket = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2Bucket", "string");
		this.accessKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccessKey", "string");
		this.secretKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2SecretKey", "string");
		this.accountId = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccountId", "string");
	}
	
	async refreshFiles() {
		return new Promise((resolve, reject) => {
			try {
				console.log('Refreshing Cloudflare R2 Files');
				
				let args = [
					"AWS_ENDPOINT_URL=https://" + this.accountId + ".r2.cloudflarestorage.com",
					"AWS_DEFAULT_OUTPUT=json",
					"AWS_DEFAULT_REGION=auto",
					"AWS_ACCESS_KEY_ID=" + this.accessKey,
					"AWS_SECRET_ACCESS_KEY=" + this.secretKey,
					"aws", "s3api", "list-objects", "--bucket", this.bucket
				];
	
				// console.log('Running refresh R2 files with args: ', args)
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
							const prefix = item.Key.substring(0, item.Key.lastIndexOf("/") + 1);
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
				
				let args = [
					"AWS_ENDPOINT_URL=https://" + this.accountId + ".r2.cloudflarestorage.com",
					"AWS_DEFAULT_OUTPUT=json",
					"AWS_DEFAULT_REGION=auto",
					"AWS_ACCESS_KEY_ID=" + this.accessKey,
					"AWS_SECRET_ACCESS_KEY=" + this.secretKey,
					"aws", "s3api", "delete-object", "--bucket", this.bucket, "--key", file.key
				];
				
				// console.log('Running delete R2 with args: ', args)
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
	
	async uploadFileToCloudflareR2(file) {
		return new Promise((resolve, reject) => {
			try {
				const fileName = nova.path.basename(file.name);
	
				const targetPath = this.currentR2FolderPath ? `${this.currentR2FolderPath}${fileName}` : fileName;
				const commonArgs = [
					"AWS_ENDPOINT_URL=https://" + this.accountId + ".r2.cloudflarestorage.com",
					"AWS_DEFAULT_OUTPUT=json",
					"AWS_DEFAULT_REGION=auto",
					"AWS_ACCESS_KEY_ID=" + this.accessKey,
					"AWS_SECRET_ACCESS_KEY=" + this.secretKey,
				];
				
				let args;
				if (file.isFolder) {
					const localFolderPath = file.uri;
					args = [
						...commonArgs,
						"aws", "s3", "sync", localFolderPath, `s3://${this.bucket}/${targetPath}`, "--endpoint-url", `https://${this.accountId}.r2.cloudflarestorage.com`
					];
				} else {
					args = [
						...commonArgs,
						"aws", "s3api", "put-object", "--bucket", this.bucket, "--key", targetPath, "--body", file.uri
					];
				};
				
				console.log('Running upload to R2 with args: ', args)
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
						console.log("File uploaded successfully:", fileName);
						this.files.push(new CloudflareR2File(fileName));
						
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
		// console.log("Fetching children for element:", element ? element.name : "root");
		// console.log("Element details:", JSON.stringify(element, null, 2));
		if (!this.fileTree || !this.fileTree.children) {
			return [];
		}
		
		if (!element) {
			return Object.keys(this.fileTree.children).map(key => {
				const fullPath = this.currentR2FolderPath ? `${this.currentR2FolderPath}/${key}` : key;
				return new CloudflareR2File(fullPath, this.fileTree.children[key].children !== undefined);
			});
		}
		
		let currentFolder = this.fileTree;
		let pathParts = element.key.split('/');
		for (let part of pathParts) {
			if (currentFolder.children && currentFolder.children[part]) {
				currentFolder = currentFolder.children[part];
			} else {
				return [];
			}
		}
		
		if (currentFolder && currentFolder.children) {
			return Object.keys(currentFolder.children).map(key => {
				const fullPath = `${element.key}/${key}`;
				return new CloudflareR2File(fullPath, currentFolder.children[key].children !== undefined);
			});
		}
		return [];
	}
	
	getTreeItem(element) {
		let item = new TreeItem(element.name);
		if (element.isFolder) {
			item.collapsibleState = TreeItemCollapsibleState.Collapsed;
			item.image = "__builtin.path";
			// console.log("CloudflareR2FileProvider: For " + element.name + " setting extension to: __builtin.path");
		} else {
			let fileExtension = element.name.split(".").pop();
			item.image = "__filetype." + fileExtension;
			// console.log("CloudflareR2FileProvider: For " + element.name + " setting extension to: " + fileExtension);
		}
		return item;
	}
}

exports.activate = function() {
	new CloudflareR2App();
}

exports.deactivate = function() {
	// Clean up any state or listeners here if needed
}
