// see https://www.npmjs.com/package/github-client
// and http://getbootstrap.com/css/ (styles for prettiness)
// and http://codemirror.net/ (text editor with syntax highlighting)
// and https://github.com/RubenVerborgh/N3.js (Turtle parser)


define(['jquery', 'github', 'N3', 'lib/codemirror', 'mode/turtle/turtle',
        'logger'],


function($, Github, N3, CodeMirror, ModeTurtle, logger) {

  var isBinary = false;

  var gh, repo, branch;
  var fileIsLoaded = false;

  var header        = $(".page-header");
  var inputUsername = $("#inputUsername");
  var inputPassword = $("#inputPassword");
  var inputOwner    = $("#inputOwner");
  var inputRepo     = $("#inputRepo");
  var inputBranch   = $("#inputBranch");
 // var inputFilename = $("#inputFilename");
  var inputContents = $("#inputContents");
  var inputMessage  = $("#inputMessage");
  var buttonLoad    = $("#loadFileButton");
  var buttonSave    = $("#saveFileButton");
  var buttonSyntax  = $("#syntaxButton");
  var selectedFile  = $("#selectFile");

  var myTextarea = inputContents[0];
  var editor = CodeMirror.fromTextArea(myTextarea,
                                             { mode: "turtle",
                                               autofocus: false,
                                               lineNumbers: true,
                                               gutters: ["CodeMirror-linenumbers", "breakpoints"]
                                             });


  editor.on("change", function(cm, o)  { buttonSyntax.click();});



  function makeMarker(errorMessage) {
    var marker = document.createElement("div");
    marker.style.color = "#822";
    marker.innerHTML = "●";
    marker.title = errorMessage;
    return marker;
  }
         
  var toggleLoadButton = function () {
    buttonLoad.toggleClass("btn-primary");
    buttonLoad.toggleClass("btn-default");
  };

  var toggleSaveButton = function () {
    buttonSave.toggleClass("btn-default");
    buttonSave.toggleClass("btn-danger");
  };

  var toggleSyntaxButton = function () {
    buttonSyntax.toggleClass("btn-default");
    buttonSyntax.toggleClass("btn-primary");
  };

  var successSignal = function () {
    header.toggleClass("bg-success");
    window.setTimeout(function () {
      header.toggleClass("bg-success");           
    }, 1500);
  };

  var loadFromGitHub = function () {

    var user;
    var username = inputUsername.val().trim();
    var ownername = inputOwner.val().trim();
    var reponame = inputRepo.val().trim();
    var branchname = inputBranch.val().trim();
    logger.clear();
    if (fileIsLoaded) {
      alert("File already loaded!");
    } else {
      gh = new Github({
        username: username,
        password: inputPassword.val().trim()
      });

      user = gh.getUser();
      logger.debug("user", user);
      if (!user) {
        logger.warning("NOT logged in: ", username);
      }
      
      repo = gh.getRepo(ownername, reponame);
      branch = repo.getBranch(branchname);

      var tree = repo.git.getTree("master", null)
              .done(function(tree) 
                {
                     for (var i = 0; i < tree.length; i++) 
                     {
                        if(tree[i].path.endsWith(".ttl"))
                        {
                          var opt = tree[i].path;
                          var el = document.createElement("option");
                          el.textContent = opt;
                          el.value = opt;
                          selectedFile.append(el);
                        }
                      }
                      readFile();
                });
    };
  };

  var readFile = function()
   {
      file = selectedFile.val()

      branch.read(file, isBinary)
              .done(function(contents) 
               {
                  editor.setValue(contents.content);

                  fileIsLoaded = true;
                  toggleLoadButton();
                  if (user) 
                  {
                    toggleSaveButton();
                  }
                  
                  toggleSyntaxButton();
                  inputUsername.attr("disabled", "disabled");
                  inputPassword.attr("disabled", "disabled");
                  inputOwner.attr("disabled", "disabled");
                  inputRepo.attr("disabled", "disabled");
                  inputBranch.attr("disabled", "disabled");

                })
                .fail(function(err) {
                    logger.error("Read from GitHub failed", err);
                });
      };

  var storeToGitHub = function () {
    var filename = inputFilename.val().trim();
    var content = editor.getValue().trim();
    var message = inputMessage.val().trim();
    logger.clear();
    if (fileIsLoaded) {
      branch.write(filename, content, message, isBinary)
        .done(function() {
          successSignal();
        })
        .fail(function(err) {
          logger.error("Saving to GitHub failed", err);
        });
    } else {
      alert("Nothing to save!");
    }
  }

  var parserHandler = function (error, triple, prefixes) {
      
      if (error) {

        /* extract line Number, only consider the end of the string after "line" */
        var errorSubString = error.message.substr(error.message.indexOf("line")+4);
        var errorLineNumber = parseInt(errorSubString) -1;

        /* add background color, gutter + tooltip */
        editor.getDoc().addLineClass(errorLineNumber, "wrap", "ErrorLine-background");
        editor.setGutterMarker(errorLineNumber, "breakpoints", makeMarker(error.message));

      } else if (!triple) {
        successSignal();
      }
  }

  var checkSyntax = function () {

    /* remove all previous errores  */
    /* TODO: IMPROVE EFFICIENCY */ 
    editor.eachLine(function(line)
            { editor.getDoc().removeLineClass(line, "wrap");
              editor.clearGutter("breakpoints");}) ;

    var parser, content;
    logger.clear();
    if (fileIsLoaded) {
      content= editor.getValue();
      parser = N3.Parser();
      parser.parse(content, parserHandler);
    }
  }
  
  buttonLoad.bind("click", loadFromGitHub);
  buttonSave.bind("click", storeToGitHub);
  buttonSyntax.bind("click", checkSyntax);
  selectedFile.bind("change", readFile);

  // pre-fill some input fields for a quick example
  inputOwner.val("vocol");
  inputRepo.val("mobivoc");
});

// helper function
function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}
