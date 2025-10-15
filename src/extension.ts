// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';

let currentPanel: vscode.WebviewPanel | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('RbgPreviewer extension is now active!');

    let disposable = vscode.commands.registerCommand('rbgpreviewer.preview', async (uri?: vscode.Uri) => {
        try {
            // Get the active text editor
            let fileUri = uri;
            if (!fileUri && vscode.window.activeTextEditor) {
                fileUri = vscode.window.activeTextEditor.document.uri;
            }

            if (!fileUri) {
                vscode.window.showErrorMessage('No .rbg file selected');
                return;
            }

            // Read the file content
            const document = await vscode.workspace.openTextDocument(fileUri);
            const content = document.getText();

            // Try to parse the JSON content
            let rbgData: any;
            try {
                rbgData = JSON.parse(content);
            } catch (e) {
                vscode.window.showErrorMessage('Invalid RBG file format. The file must be a valid JSON.');
                return;
            }

            // Create and show webview panel
            const columnToShowIn = vscode.window.activeTextEditor
                ? vscode.window.activeTextEditor.viewColumn
                : undefined;

            if (currentPanel) {
                currentPanel.reveal(columnToShowIn);
            } else {
                currentPanel = vscode.window.createWebviewPanel(
                    'rbgPreview',
                    'RBG Graph Preview',
                    columnToShowIn || vscode.ViewColumn.One,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: [
                            vscode.Uri.file(path.join(context.extensionPath, 'media'))
                        ]
                    }
                );

                // Handle panel disposal
                currentPanel.onDidDispose(
                    () => {
                        currentPanel = undefined;
                    },
                    null,
                    context.subscriptions
                );
            }

            // Update content
            currentPanel.webview.html = getWebviewContent(rbgData);

            // Handle messages from the webview
            currentPanel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'error':
                            vscode.window.showErrorMessage(message.text);
                            return;
                    }
                },
                undefined,
                context.subscriptions
            );

            // Set up file watcher to auto-update preview
            const watcher = vscode.workspace.createFileSystemWatcher(fileUri.fsPath);
            watcher.onDidChange(async () => {
                if (currentPanel) {
                    const document = await vscode.workspace.openTextDocument(fileUri!);
                    const content = document.getText();
                    try {
                        const rbgData = JSON.parse(content);
                        currentPanel.webview.html = getWebviewContent(rbgData);
                    } catch (e) {
                        vscode.window.showErrorMessage('Error updating preview: Invalid RBG file format');
                    }
                }
            });

            context.subscriptions.push(watcher);

        } catch (error) {
            vscode.window.showErrorMessage(`Error opening RBG preview: ${error}`);
        }
    });

    context.subscriptions.push(disposable);
}

function getWebviewContent(rbgData: any): string {
    try {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>RBG Graph Preview</title>
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    padding: 20px;
                }
                #graphCanvas {
                    border: 1px solid var(--vscode-panel-border);
                    margin-bottom: 20px;
                }
                .controls {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .info-panel {
                    padding: 10px;
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 4px;
                }
                button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="controls">
                    <button onclick="zoomIn()">Zoom In</button>
                    <button onclick="zoomOut()">Zoom Out</button>
                    <button onclick="resetZoom()">Reset</button>
                </div>
                <canvas id="graphCanvas"></canvas>
                <div class="info-panel">
                    <h3>Graph Information</h3>
                    <p>ID: ${rbgData.id}</p>
                    <p>Type: ${rbgData.type_name}</p>
                    <p>Nodes: ${rbgData.nodes?.length || 0}</p>
                </div>
            </div>
            <script>
                const canvas = document.getElementById('graphCanvas');
                const ctx = canvas.getContext('2d');
                let scale = 1;
                let offsetX = 0;
                let offsetY = 0;
                const nodeData = ${JSON.stringify(rbgData.nodes || [])};
                
                function initCanvas() {
                    canvas.width = canvas.parentElement.clientWidth - 40;
                    canvas.height = window.innerHeight * 0.6;
                    drawGraph();
                }

                function drawGraph() {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.save();
                    ctx.translate(offsetX, offsetY);
                    ctx.scale(scale, scale);

                    // Draw nodes
                    nodeData.forEach(node => {
                        if (node.render_config && node.render_config.visible) {
                            const { x, y, width, height, color } = node.render_config;
                            
                            // Draw node shape
                            ctx.fillStyle = color;
                            ctx.strokeStyle = 'var(--vscode-editor-foreground)';
                            ctx.lineWidth = 1;
                            
                            if (node.type_name === 'start') {
                                // Draw start node as circle
                                ctx.beginPath();
                                ctx.arc(x + width/2, y + height/2, Math.min(width, height)/2, 0, Math.PI * 2);
                                ctx.fill();
                                ctx.stroke();
                            } else {
                                // Draw regular node as rectangle
                                ctx.beginPath();
                                ctx.roundRect(x, y, width, height, 5);
                                ctx.fill();
                                ctx.stroke();
                            }

                            // Draw node text
                            ctx.fillStyle = 'var(--vscode-editor-foreground)';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.font = '12px Arial';
                            ctx.fillText(node.desc || node.type_name, x + width/2, y + height/2);
                        }
                    });

                    ctx.restore();
                }

                function zoomIn() {
                    scale *= 1.2;
                    drawGraph();
                }

                function zoomOut() {
                    scale /= 1.2;
                    drawGraph();
                }

                function resetZoom() {
                    scale = 1;
                    offsetX = 0;
                    offsetY = 0;
                    drawGraph();
                }

                // Handle pan
                let isDragging = false;
                let startX, startY;

                canvas.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    startX = e.clientX - offsetX;
                    startY = e.clientY - offsetY;
                });

                canvas.addEventListener('mousemove', (e) => {
                    if (isDragging) {
                        offsetX = e.clientX - startX;
                        offsetY = e.clientY - startY;
                        drawGraph();
                    }
                });

                canvas.addEventListener('mouseup', () => {
                    isDragging = false;
                });

                canvas.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    const zoom = e.deltaY < 0 ? 1.1 : 0.9;
                    scale *= zoom;
                    drawGraph();
                });

                // Handle window resize
                window.addEventListener('resize', initCanvas);

                // Initial draw
                initCanvas();
            </script>
        </body>
        </html>`;
    } catch (error) {
        return `
        <!DOCTYPE html>
        <html>
            <body>
                <h1>Error rendering RBG graph</h1>
                <p>An error occurred while trying to render the graph: ${error}</p>
            </body>
        </html>`;
    }
}

// This method is called when your extension is deactivated
export function deactivate() {}
