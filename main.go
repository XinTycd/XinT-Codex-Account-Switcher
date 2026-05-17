package main

import (
	"embed"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()
	go systray.Run(app.onTrayReady, app.onTrayExit)

	err := wails.Run(&options.App{
		Title:            AppTitle,
		Width:            1220,
		Height:           860,
		MinWidth:         980,
		MinHeight:        720,
		BackgroundColour: &options.RGBA{R: 15, G: 15, B: 15, A: 1},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup:     app.startup,
		OnBeforeClose: app.beforeClose,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		panic(err)
	}
}
