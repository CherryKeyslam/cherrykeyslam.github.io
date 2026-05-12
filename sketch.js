const sketchMaker = (players,colours) => {
return (sketch) => {
let buffer;

const width = window.innerWidth;
const height = window.innerHeight+100;

const knightmove = [[2,1],[1,2],[-1,2],[2,-1],[1,-2],[-2,1],[-1,-2],[-2,-1]];
const pawnmove = [[1,1],[-1,1]];
const kingmove = [[-1,0],[1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
const generalmove = knightmove.concat(kingmove);
const camelmove = [[3,1],[1,3],[-1,3],[3,-1],[1,-3],[-3,1],[-1,-3],[-3,-1]];
const wildebeestmove = knightmove.concat(camelmove);
const ferzmove = [[1,1],[-1,1],[-1,-1],[1,-1]];
const wazirmove = [[1,0],[0,1],[-1,0],[0,-1]];
const alfilmove = [[2,2],[-2,2],[-2,-2],[2,-2]];
const dabbabamove = [[2,0],[0,2],[-2,0],[0,-2]];
const alibabamove = alfilmove.concat(dabbabamove);

const moveset = [knightmove,pawnmove,kingmove,generalmove,camelmove,wildebeestmove,ferzmove,wazirmove,alfilmove,dabbabamove,alibabamove];

const numplayers = players.length;

sketch.setup = () => {
    sketch.createCanvas(width, height);
    buffer = sketch.createGraphics(width,height);
    buffer.clear();
}

let speed = 5;
let rounds = 0;
let loopunit = [0,1,0,1,0]; // step no., steps remaining in this direction, step direction, direction vector (x,y)
let positions = Array.from({ length: numplayers }, () => [...[0,0]]);
let loopmovement = Array.from({ length: numplayers }, () => [...loopunit]);
let size = 501; // size of game board (odd)
let middle = (size-1)/2;
let attackdictionary = Array.from({ length: size }, () =>
    Array.from({ length: size }, () =>
        Array(numplayers).fill(false)
    )
); //who attacks and occupies what square

attackdictionary[middle][middle][numplayers-1] = true;
for(let i=0;i<moveset[players[numplayers-1]].length;i++) { // attacking
    attackdictionary[middle+moveset[players[numplayers-1]][i][0]][middle+moveset[players[numplayers-1]][i][1]][numplayers-1]=true;
}



sketch.draw = () => {
    let zoom = 8;

    buffer.push();
    buffer.translate(width/2,height/2);
    buffer.scale(zoom,-zoom); // translate coordinate system to make it normal
    rounds+=speed;

    if(rounds<50000/numplayers) {
        for(let multiple=0;multiple<speed;multiple++) {
            for(let turn=0;turn<numplayers;turn++) {
                let found = false; // as long as we dont find a suitable place, keep moving
                let xpos; let ypos;
                while(!found) {
                    if(loopmovement[turn][1]>0) { // if theres steps left then MOVE
                        positions[turn][0] += loopmovement[turn][3]; //move according to the direction vector
                        positions[turn][1] += loopmovement[turn][4];
                        loopmovement[turn][1]--;

                        xpos = positions[turn][0];
                        ypos = positions[turn][1];

                        // check if occupied/attacked
                        let listatcell = attackdictionary[middle+xpos][middle+ypos]; // retrieve the attack dict for the current position

                        found = true;
                        for(let i=0;i<numplayers;i++) {
                            if(i!= turn && listatcell[i]==true) {
                                found=false;
                                break;
                            }
                        } // if unavailable move on otherwise settle

                    } 
                    else { //if the step is over then TURN
                        loopmovement[turn][0]++; //+1 to step number
                        let stepnum = loopmovement[turn][0];
                        loopmovement[turn][1] = 1 + (stepnum - (stepnum%2))/2; // set the remaining number of steps in this direction;
                        let direction = loopmovement[turn][2];
                        loopmovement[turn][2] = (direction + 1)%4; //+1 to step direction 
                        let x;
                        let y;
                        switch(loopmovement[turn][2]) {
                            case 0:
                                x=1; y=0;
                                break;
                            case 1:
                                x=0;y=1;
                                break;
                            case 2:
                                x=-1;y=0;
                                break;
                            case 3:
                                x=0;y=-1;
                                break;
                        } //update direction vector according to direction
                        loopmovement[turn][3] = x;
                        loopmovement[turn][4] = y;
                    }
                }
                //update attack dictionary on settling
                attackdictionary[middle+xpos][middle+ypos][turn] = true; // occupied
                for(let i=0;i<moveset[players[turn]].length;i++) { // attacking
                    attackdictionary[middle+xpos+moveset[players[turn]][i][0]][middle+ypos+moveset[players[turn]][i][1]][turn]=true;
                }
                buffer.fill(sketch.color(colours[turn]));
                buffer.noStroke();
                buffer.circle(positions[turn][0], positions[turn][1], 0.1*zoom);
            }
        }
    }

    buffer.pop();

    sketch.image(buffer,0,0);

}
}
}

let kingdomRenderer;

document.body.style.display = 'block';

let upieces = [];
let ucolours = [];

const pieceSelector = document.getElementById('piece-select');
const colourPicker = document.getElementById('piece-colour');
const but1 = document.getElementById('push-piece');
const but2 = document.getElementById('pop-piece');
const but3 = document.getElementById('render');
const tableOfPieces = document.getElementById('pieces-list');

but1.addEventListener('click', pushPiece);
but2.addEventListener('click', popPiece);
but3.addEventListener('click', startRendering);


function pushPiece() {
    upieces.push(parseInt(pieceSelector.value));
    ucolours.push(colourPicker.value);

    let row = tableOfPieces.insertRow(-1);

    var cell1 = row.insertCell(0);
    var cell2 = row.insertCell(1);

    cell1.innerHTML = pieceSelector.options[pieceSelector.selectedIndex].text;
    cell2.innerHTML = "<pre>   </pre>"; 
    cell2.style.backgroundColor = ucolours[ucolours.length-1];
}

function popPiece() {
    upieces.pop();
    ucolours.pop();
    tableOfPieces.deleteRow(-1);
}

function startRendering() {
    kingdomRenderer = new p5(sketchMaker(upieces,ucolours),document.getElementById('kingdom'));
}
